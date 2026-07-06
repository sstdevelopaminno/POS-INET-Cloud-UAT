import { NextResponse } from "next/server";
import { FeatureGateError, requireTenantFeature } from "@/lib/feature-gate";
import { PosGuardError, requirePermission, requirePosSession, withPosSessionCookie } from "@/lib/pos-session-guard";
import { resolveAttendanceStatus, todayDateIso } from "@/lib/services/attendance-service";

export async function GET(request: Request) {
  try {
    const scope = await requirePosSession();
    requirePermission(scope, "attendance:view_self");
    await requireTenantFeature(scope.session.tenant_id, "attendance_tracking", scope.session.branch_id);
    const { searchParams } = new URL(request.url);
    const requestedDate = String(searchParams.get("date") ?? "").trim();
    const attendanceDate = /^\d{4}-\d{2}-\d{2}$/.test(requestedDate) ? requestedDate : todayDateIso();
    const attendance = await resolveAttendanceStatus({
      scope,
      attendanceDate
    });

    const response = NextResponse.json({
      data: {
        date: attendanceDate,
        summary: attendance.summary,
        can_view_all_branch: attendance.canViewAllBranch,
        can_manage: attendance.canManage,
        staff: attendance.staff
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
      { data: null, error: { code: "attendance_status_failed", message: error instanceof Error ? error.message : "Unknown error." } },
      { status: 500 }
    );
  }
}
