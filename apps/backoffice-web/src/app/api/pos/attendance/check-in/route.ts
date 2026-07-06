import { NextResponse } from "next/server";
import { appendAuditLog } from "@/lib/audit-log";
import { FeatureGateError, requireTenantFeature } from "@/lib/feature-gate";
import { PosGuardError, requirePermission, requirePosSession, withPosSessionCookie } from "@/lib/pos-session-guard";
import {
  computeLateMinutes,
  todayDateIso,
  upsertAttendanceRecord,
  writeAttendanceEvent
} from "@/lib/services/attendance-service";

type CheckInPayload = {
  source?: string;
  scheduled_start_at?: string | null;
  note?: string | null;
};

export async function POST(request: Request) {
  try {
    const scope = await requirePosSession();
    requirePermission(scope, "attendance:view_self");
    await requireTenantFeature(scope.session.tenant_id, "attendance_tracking", scope.session.branch_id);
    const body = (await request.json().catch(() => null)) as CheckInPayload | null;
    const checkedInAt = new Date().toISOString();
    const scheduledStartAt = body?.scheduled_start_at ? String(body.scheduled_start_at).trim() : null;
    const lateMinutes = computeLateMinutes(scheduledStartAt || null, checkedInAt);
    const status = lateMinutes > 0 ? "late" : "checked_in";

    const record = await upsertAttendanceRecord({
      tenantId: scope.session.tenant_id,
      branchId: scope.session.branch_id,
      userId: scope.session.user_id,
      attendanceDate: todayDateIso(),
      status,
      source: String(body?.source ?? "pos_check_in"),
      note: body?.note ?? null,
      checkedInAt,
      lateMinutes
    });

    await writeAttendanceEvent({
      tenantId: scope.session.tenant_id,
      branchId: scope.session.branch_id,
      userId: scope.session.user_id,
      eventType: "staff_check_in",
      deviceCode: scope.session.device_code,
      shiftId: scope.session.shift_id,
      posSessionId: scope.session.id,
      metadata: {
        attendance_record_id: record.id,
        late_minutes: lateMinutes
      }
    });

    await appendAuditLog({
      tenantId: scope.session.tenant_id,
      branchId: scope.session.branch_id,
      actorUserId: scope.session.user_id,
      actorRole: scope.session.role as "owner" | "manager" | "staff" | "accountant",
      targetUserId: scope.session.user_id,
      action: "staff_check_in",
      targetTable: "staff_attendance_records",
      targetId: record.id,
      metadata: {
        status: record.status,
        attendance_date: record.attendance_date,
        device_code: scope.session.device_code,
        pos_session_id: scope.session.id
      }
    });

    if (status === "late") {
      await appendAuditLog({
        tenantId: scope.session.tenant_id,
        branchId: scope.session.branch_id,
        actorUserId: scope.session.user_id,
        actorRole: scope.session.role as "owner" | "manager" | "staff" | "accountant",
        targetUserId: scope.session.user_id,
        action: "staff_marked_late",
        targetTable: "staff_attendance_records",
        targetId: record.id,
        metadata: {
          late_minutes: record.late_minutes
        }
      });
    }

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
      { data: null, error: { code: "attendance_check_in_failed", message: error instanceof Error ? error.message : "Unknown error." } },
      { status: 500 }
    );
  }
}
