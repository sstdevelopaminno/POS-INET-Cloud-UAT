import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getRequestMeta, writeAuditLog, writeLoginAttempt } from "@/lib/server/audit-log";
import { AuthTimeoutError, withAuthTimeout } from "@/lib/server/auth-timeout";
import { hasPermission, resolveEmployeeByCode } from "@/lib/server/pre-entry-auth";
import { createFlowState, hasFlowStage, readPreEntryFlowState, writePreEntryFlowState } from "@/lib/server/pre-entry-state";
import { getSupabaseServiceClient } from "@/lib/supabase-admin";

type RequestBody = {
  employee_code?: string;
};

type BranchLoginPolicy = {
  allow_pin_login: boolean | null;
  allow_staff_card_login: boolean | null;
  require_registered_device: boolean | null;
};

function runInBackground(task: () => Promise<unknown>) {
  void task().catch((error) => {
    console.error("[auth/employee/verify-code] background task failed", {
      error: error instanceof Error ? error.message : "Unknown error"
    });
  });
}

function withTimingHeaders<T extends NextResponse>(response: T, startedAt: number): T {
  const durationMs = Date.now() - startedAt;
  response.headers.set("x-auth-api-ms", String(durationMs));
  response.headers.set("server-timing", `total;dur=${durationMs}`);
  return response;
}

async function loadBranchEmployeeLoginPolicy({
  tenantId,
  branchId
}: {
  tenantId: string;
  branchId: string;
}): Promise<BranchLoginPolicy | null> {
  const supabase = getSupabaseServiceClient();

  const { data, error } = await supabase
    .from("branch_login_policies")
    .select("allow_pin_login,allow_staff_card_login,require_registered_device")
    .eq("tenant_id", tenantId)
    .eq("branch_id", branchId)
    .maybeSingle();

  if (error) {
    console.error("[auth/employee/verify-code] branch policy lookup failed", {
      tenantId,
      branchId,
      error: error.message
    });
    throw new Error("branch_policy_lookup_failed");
  }

  return data as BranchLoginPolicy | null;
}

export async function POST(request: Request) {
  const startedAt = Date.now();
  const body = (await request.json().catch(() => null)) as RequestBody | null;
  const employeeCodeInput = String(body?.employee_code ?? "").trim();

  if (!employeeCodeInput) {
    return withTimingHeaders(
      NextResponse.json(
        { data: null, error: { code: "employee_code_required", message: "กรุณากรอกรหัสพนักงาน" } },
        { status: 400 }
      ),
      startedAt
    );
  }

  const cookieStore = await cookies();
  const flow = readPreEntryFlowState(cookieStore);

  if (!flow) {
    return withTimingHeaders(
      NextResponse.json(
        { data: null, error: { code: "missing_branch_context", message: "กรุณาเลือกสาขาก่อนยืนยันตัวตนพนักงาน" } },
        { status: 401 }
      ),
      startedAt
    );
  }

  if (!hasFlowStage(flow, ["branch_selected", "employee_verified"]) || !flow.branchId) {
    return withTimingHeaders(
      NextResponse.json(
        { data: null, error: { code: "missing_branch_context", message: "กรุณาเลือกสาขาก่อนยืนยันตัวตนพนักงาน" } },
        { status: 401 }
      ),
      startedAt
    );
  }

  const { ipAddress, userAgent } = getRequestMeta(request);

  try {
    const policy = await withAuthTimeout(
      loadBranchEmployeeLoginPolicy({
        tenantId: flow.tenantId,
        branchId: flow.branchId
      }),
      "employee_policy_lookup_timeout"
    );

    const allowEmployeeCodeLogin = Boolean(policy?.allow_pin_login || policy?.allow_staff_card_login);

    if (!policy || !allowEmployeeCodeLogin) {
      runInBackground(() =>
        writeAuditLog({
          tenantId: flow.tenantId,
          branchId: flow.branchId,
          actorRole: "system",
          action: "permission_denied",
          targetType: "branch_login_policy",
          targetId: flow.branchId,
          ipAddress,
          userAgent,
          metadata: {
            reason: "employee_code_login_disabled",
            allow_pin_login: policy?.allow_pin_login ?? null,
            allow_staff_card_login: policy?.allow_staff_card_login ?? null,
            source: "employee_code"
          }
        })
      );

      return withTimingHeaders(
        NextResponse.json(
          {
            data: null,
            error: {
              code: "employee_code_login_disabled",
              message: "สาขานี้ยังไม่เปิดใช้งานล็อกอินด้วยรหัสพนักงาน"
            }
          },
          { status: 403 }
        ),
        startedAt
      );
    }

    const employee = await withAuthTimeout(
      resolveEmployeeByCode({
        tenantId: flow.tenantId,
        branchId: flow.branchId,
        employeeCode: employeeCodeInput
      }),
      "employee_lookup_timeout"
    );

    if (!employee) {
      runInBackground(() =>
        writeLoginAttempt({
          tenantId: flow.tenantId,
          branchId: flow.branchId,
          loginMethod: "staff_card",
          success: false,
          failureReason: "auth_failed",
          ipAddress,
          userAgent,
          metadata: { source: "employee_code" }
        })
      );

      return withTimingHeaders(
        NextResponse.json(
          {
            data: null,
            error: {
              code: "employee_not_found",
              message: "ไม่พบพนักงานในสาขานี้ หรือพนักงานไม่พร้อมใช้งาน"
            }
          },
          { status: 401 }
        ),
        startedAt
      );
    }

    if (!hasPermission(employee.permissions, "pos.sales.access")) {
      runInBackground(() =>
        writeAuditLog({
          tenantId: flow.tenantId,
          branchId: flow.branchId,
          actorUserId: employee.userId,
          actorRole: employee.role,
          targetUserId: employee.userId,
          action: "permission_denied",
          targetType: "user_branch_role",
          targetId: employee.userId,
          ipAddress,
          userAgent,
          metadata: {
            permission: "pos.sales.access",
            source: "employee_code"
          }
        })
      );

      return withTimingHeaders(
        NextResponse.json(
          { data: null, error: { code: "permission_denied", message: "พนักงานไม่มีสิทธิ์เข้าใช้งานหน้าขาย" } },
          { status: 403 }
        ),
        startedAt
      );
    }

    const nextFlow = createFlowState({
      ...flow,
      stage: "employee_verified",
      userId: employee.userId,
      userRole: employee.role,
      employeeCode: employee.employeeCode,
      employeeName: employee.fullName,
      employeeAuthMethod: "employee_code",
      permissions: employee.permissions
    });

    const response = NextResponse.json({
      data: {
        employee: {
          id: employee.userId,
          code: employee.employeeCode,
          name: employee.fullName,
          role: employee.role
        },
        permissions: employee.permissions,
        next_step: "devices"
      },
      error: null
    });

    writePreEntryFlowState(response, nextFlow);

    runInBackground(() =>
      writeLoginAttempt({
        tenantId: flow.tenantId,
        branchId: flow.branchId,
        userId: employee.userId,
        loginMethod: "staff_card",
        success: true,
        ipAddress,
        userAgent,
        metadata: { source: "employee_code" }
      })
    );

    runInBackground(() =>
      writeAuditLog({
        tenantId: flow.tenantId,
        branchId: flow.branchId,
        actorUserId: employee.userId,
        actorRole: employee.role,
        targetUserId: employee.userId,
        action: "employee_verification_success",
        targetType: "users_profiles",
        targetId: employee.userId,
        ipAddress,
        userAgent,
        metadata: { source: "employee_code" }
      })
    );

    return withTimingHeaders(response, startedAt);
  } catch (error) {
    if (error instanceof AuthTimeoutError) {
      return withTimingHeaders(
        NextResponse.json(
          { data: null, error: { code: "auth_timeout", message: "ระบบตอบสนองช้าเกินไป กรุณาลองใหม่อีกครั้ง" } },
          { status: 504 }
        ),
        startedAt
      );
    }

    console.error("[auth/employee/verify-code] unexpected error", {
      tenantId: flow.tenantId,
      branchId: flow.branchId,
      error: error instanceof Error ? error.message : "Unknown error"
    });

    return withTimingHeaders(
      NextResponse.json(
        { data: null, error: { code: "employee_verify_failed", message: "ไม่สามารถยืนยันตัวตนพนักงานได้" } },
        { status: 500 }
      ),
      startedAt
    );
  }
}