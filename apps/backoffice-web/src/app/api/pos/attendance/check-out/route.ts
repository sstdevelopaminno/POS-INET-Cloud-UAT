import { NextResponse } from "next/server";
import { appendAuditLog } from "@/lib/audit-log";
import { FeatureGateError, requireTenantFeature } from "@/lib/feature-gate";
import { PosGuardError, requirePermission, requirePosSession, withPosSessionCookie } from "@/lib/pos-session-guard";
import { todayDateIso, upsertAttendanceRecord, writeAttendanceEvent } from "@/lib/services/attendance-service";

type CheckOutPayload = {
  source?: string;
  note?: string | null;
};

export async function POST(request: Request) {
  try {
    const scope = await requirePosSession();
    requirePermission(scope, "attendance:view_self");
    await requireTenantFeature(scope.session.tenant_id, "attendance_tracking", scope.session.branch_id);
    const body = (await request.json().catch(() => null)) as CheckOutPayload | null;
    const checkedOutAt = new Date().toISOString();

    const record = await upsertAttendanceRecord({
      tenantId: scope.session.tenant_id,
      branchId: scope.session.branch_id,
      userId: scope.session.user_id,
      attendanceDate: todayDateIso(),
      status: "checked_out",
      source: String(body?.source ?? "pos_check_out"),
      note: body?.note ?? null,
      checkedOutAt
    });

    await writeAttendanceEvent({
      tenantId: scope.session.tenant_id,
      branchId: scope.session.branch_id,
      userId: scope.session.user_id,
      eventType: "staff_check_out",
      deviceCode: scope.session.device_code,
      shiftId: scope.session.shift_id,
      posSessionId: scope.session.id,
      metadata: {
        attendance_record_id: record.id
      }
    });

    await appendAuditLog({
      tenantId: scope.session.tenant_id,
      branchId: scope.session.branch_id,
      actorUserId: scope.session.user_id,
      actorRole: scope.session.role as "owner" | "manager" | "staff" | "accountant",
      targetUserId: scope.session.user_id,
      action: "staff_check_out",
      targetTable: "staff_attendance_records",
      targetId: record.id,
      metadata: {
        status: record.status,
        attendance_date: record.attendance_date,
        device_code: scope.session.device_code,
        pos_session_id: scope.session.id
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
      { data: null, error: { code: "attendance_check_out_failed", message: error instanceof Error ? error.message : "Unknown error." } },
      { status: 500 }
    );
  }
}
