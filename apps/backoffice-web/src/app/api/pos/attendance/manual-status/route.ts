import { NextResponse } from "next/server";
import { appendAuditLog } from "@/lib/audit-log";
import { FeatureGateError, requireTenantFeature } from "@/lib/feature-gate";
import {
  PosGuardError,
  requirePermission,
  requirePosSession,
  withPosSessionCookie
} from "@/lib/pos-session-guard";
import { todayDateIso, upsertAttendanceRecord, writeAttendanceEvent } from "@/lib/services/attendance-service";
import { getSupabaseServiceClient } from "@/lib/supabase-admin";

type ManualAttendanceStatus = "on_leave" | "absent" | "late" | "checked_in";

type ManualStatusPayload = {
  user_id?: string;
  status?: ManualAttendanceStatus;
  note?: string | null;
  attendance_date?: string;
  leave_request_id?: string;
  leave_decision?: "approve" | "reject";
  rejected_reason?: string | null;
  late_minutes?: number;
};

function isManualStatus(value: unknown): value is ManualAttendanceStatus {
  return value === "on_leave" || value === "absent" || value === "late" || value === "checked_in";
}

export async function POST(request: Request) {
  try {
    const scope = await requirePosSession();
    await requireTenantFeature(scope.session.tenant_id, "attendance_tracking", scope.session.branch_id);
    requirePermission(scope, "attendance:manage");
    const body = (await request.json().catch(() => null)) as ManualStatusPayload | null;

    const userId = String(body?.user_id ?? "").trim();
    const statusValue = body?.status;
    if (!userId) {
      return NextResponse.json({ data: null, error: { code: "user_id_required", message: "user_id is required." } }, { status: 422 });
    }
    if (!isManualStatus(statusValue)) {
      return NextResponse.json(
        { data: null, error: { code: "invalid_status", message: "Allowed statuses: on_leave, absent, late, checked_in." } },
        { status: 422 }
      );
    }

    const attendanceDateRaw = String(body?.attendance_date ?? "").trim();
    const attendanceDate = /^\d{4}-\d{2}-\d{2}$/.test(attendanceDateRaw) ? attendanceDateRaw : todayDateIso();
    const supabase = getSupabaseServiceClient();

    const { data: branchRoleRow } = await supabase
      .from("user_branch_roles")
      .select("user_id")
      .eq("tenant_id", scope.session.tenant_id)
      .eq("branch_id", scope.session.branch_id)
      .eq("user_id", userId)
      .maybeSingle<{ user_id: string }>();
    if (!branchRoleRow) {
      return NextResponse.json({ data: null, error: { code: "user_not_in_branch", message: "Target user is not in this branch." } }, { status: 404 });
    }

    if (body?.leave_request_id && body?.leave_decision) {
      const leaveRequestId = String(body.leave_request_id).trim();
      const leaveDecision = body.leave_decision;
      const { data: leaveRow, error: leaveQueryError } = await supabase
        .from("staff_leave_requests")
        .select("id,user_id,status")
        .eq("tenant_id", scope.session.tenant_id)
        .eq("branch_id", scope.session.branch_id)
        .eq("id", leaveRequestId)
        .eq("user_id", userId)
        .maybeSingle<{ id: string; user_id: string; status: string }>();
      if (leaveQueryError) {
        return NextResponse.json({ data: null, error: { code: "leave_request_query_failed", message: leaveQueryError.message } }, { status: 500 });
      }
      if (!leaveRow) {
        return NextResponse.json({ data: null, error: { code: "leave_request_not_found", message: "Leave request not found." } }, { status: 404 });
      }

      if (leaveDecision === "approve") {
        await supabase
          .from("staff_leave_requests")
          .update({
            status: "approved",
            approved_by: scope.session.user_id,
            approved_at: new Date().toISOString(),
            rejected_reason: null
          })
          .eq("id", leaveRequestId)
          .eq("tenant_id", scope.session.tenant_id)
          .eq("branch_id", scope.session.branch_id);

        await appendAuditLog({
          tenantId: scope.session.tenant_id,
          branchId: scope.session.branch_id,
          actorUserId: scope.session.user_id,
          actorRole: scope.session.role as "owner" | "manager" | "staff" | "accountant",
          targetUserId: userId,
          action: "staff_leave_approved",
          targetTable: "staff_leave_requests",
          targetId: leaveRequestId,
          metadata: {
            attendance_date: attendanceDate
          }
        });
      } else {
        await supabase
          .from("staff_leave_requests")
          .update({
            status: "rejected",
            approved_by: scope.session.user_id,
            approved_at: new Date().toISOString(),
            rejected_reason: String(body?.rejected_reason ?? "").trim() || "Rejected by manager/owner"
          })
          .eq("id", leaveRequestId)
          .eq("tenant_id", scope.session.tenant_id)
          .eq("branch_id", scope.session.branch_id);

        await appendAuditLog({
          tenantId: scope.session.tenant_id,
          branchId: scope.session.branch_id,
          actorUserId: scope.session.user_id,
          actorRole: scope.session.role as "owner" | "manager" | "staff" | "accountant",
          targetUserId: userId,
          action: "staff_leave_rejected",
          targetTable: "staff_leave_requests",
          targetId: leaveRequestId,
          metadata: {
            attendance_date: attendanceDate,
            rejected_reason: String(body?.rejected_reason ?? "").trim() || null
          }
        });
      }
    }

    const lateMinutes = statusValue === "late" ? Math.max(0, Number(body?.late_minutes ?? 1)) : 0;
    const nowIso = new Date().toISOString();
    const record = await upsertAttendanceRecord({
      tenantId: scope.session.tenant_id,
      branchId: scope.session.branch_id,
      userId,
      attendanceDate,
      status: statusValue,
      source: "manual",
      note: body?.note ?? null,
      checkedInAt: statusValue === "checked_in" || statusValue === "late" ? nowIso : null,
      checkedOutAt: null,
      lateMinutes,
      approvedBy: scope.session.user_id
    });

    await writeAttendanceEvent({
      tenantId: scope.session.tenant_id,
      branchId: scope.session.branch_id,
      userId,
      eventType: `staff_manual_${statusValue}`,
      deviceCode: scope.session.device_code,
      shiftId: scope.session.shift_id,
      posSessionId: scope.session.id,
      metadata: {
        attendance_record_id: record.id,
        note: body?.note ?? null,
        late_minutes: lateMinutes
      }
    });

    const actionByStatus: Record<ManualAttendanceStatus, string> = {
      checked_in: "staff_check_in",
      late: "staff_marked_late",
      absent: "staff_marked_absent",
      on_leave: "staff_leave_approved"
    };

    await appendAuditLog({
      tenantId: scope.session.tenant_id,
      branchId: scope.session.branch_id,
      actorUserId: scope.session.user_id,
      actorRole: scope.session.role as "owner" | "manager" | "staff" | "accountant",
      targetUserId: userId,
      action: actionByStatus[statusValue],
      targetTable: "staff_attendance_records",
      targetId: record.id,
      metadata: {
        attendance_date: record.attendance_date,
        status: record.status,
        late_minutes: record.late_minutes,
        note: body?.note ?? null
      }
    });

    await appendAuditLog({
      tenantId: scope.session.tenant_id,
      branchId: scope.session.branch_id,
      actorUserId: scope.session.user_id,
      actorRole: scope.session.role as "owner" | "manager" | "staff" | "accountant",
      targetUserId: userId,
      action: "staff_manual_override",
      targetTable: "staff_attendance_records",
      targetId: record.id,
      metadata: {
        status: statusValue,
        attendance_date: record.attendance_date
      }
    });

    const response = NextResponse.json({
      data: {
        attendance_record: record
      },
      error: null
    });
    return withPosSessionCookie(response, scope.session.id);
  } catch (error) {
    if (error instanceof FeatureGateError) {
      return NextResponse.json({ data: null, error: { code: error.code, message: error.message } }, { status: error.status });
    }
    if (error instanceof PosGuardError) {
      return NextResponse.json({ data: null, error: { code: error.code, message: error.message } }, { status: error.status });
    }
    return NextResponse.json(
      { data: null, error: { code: "attendance_manual_status_failed", message: error instanceof Error ? error.message : "Unknown error." } },
      { status: 500 }
    );
  }
}
