import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSupabaseServiceClient } from "@/lib/supabase-admin";
import { getRequestMeta, writeAuditLog } from "@/lib/server/audit-log";
import { AuthTimeoutError, withAuthTimeout } from "@/lib/server/auth-timeout";
import { createFlowState, hasFlowStage, readPreEntryFlowState, writePreEntryFlowState } from "@/lib/server/pre-entry-state";

type RequestBody = {
  branch_id?: string;
};

function runInBackground(task: () => Promise<unknown>) {
  void task().catch((error) => {
    console.error("[auth/branches/select] background task failed", {
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

export async function POST(request: Request) {
  const startedAt = Date.now();
  const body = (await request.json().catch(() => null)) as RequestBody | null;
  const branchId = String(body?.branch_id ?? "").trim();
  if (!branchId) {
    return withTimingHeaders(
      NextResponse.json(
        { data: null, error: { code: "branch_required", message: "กรุณาเลือกสาขา" } },
        { status: 400 }
      ),
      startedAt
    );
  }

  const cookieStore = await cookies();
  const flow = readPreEntryFlowState(cookieStore);
  if (!hasFlowStage(flow, ["store_verified", "branch_selected", "employee_verified"])) {
    return withTimingHeaders(
      NextResponse.json(
        { data: null, error: { code: "missing_store_context", message: "กรุณาเริ่มจากหน้ากรอกรหัสร้านค้า" } },
        { status: 401 }
      ),
      startedAt
    );
  }
  if (!flow) {
    return withTimingHeaders(
      NextResponse.json(
        { data: null, error: { code: "missing_store_context", message: "กรุณาเริ่มจากหน้ากรอกรหัสร้านค้า" } },
        { status: 401 }
      ),
      startedAt
    );
  }

  try {
    const supabase = getSupabaseServiceClient();
    const { data: branch, error: branchError } = await withAuthTimeout(
      supabase
        .from("branches")
        .select("id,tenant_id,code,name,is_active")
        .eq("id", branchId)
        .maybeSingle<{ id: string; tenant_id: string; code: string | null; name: string | null; is_active: boolean }>(),
      "branch_select_lookup_timeout"
    );

    if (branchError) {
      return withTimingHeaders(
        NextResponse.json(
          { data: null, error: { code: "branch_select_failed", message: "ไม่สามารถตรวจสอบสาขาได้" } },
          { status: 500 }
        ),
        startedAt
      );
    }

    if (!branch || branch.is_active === false || branch.tenant_id !== flow.tenantId) {
      return withTimingHeaders(
        NextResponse.json(
          { data: null, error: { code: "invalid_branch", message: "สาขาที่เลือกไม่ถูกต้อง หรือไม่พร้อมใช้งาน" } },
          { status: 403 }
        ),
        startedAt
      );
    }

    const nextFlow = createFlowState({
      ...flow,
      stage: "branch_selected",
      branchId: branch.id,
      branchCode: branch.code,
      branchName: branch.name,
      userId: null,
      userRole: null,
      employeeCode: null,
      employeeName: null,
      employeeAuthMethod: null,
      permissions: null
    });

    const response = NextResponse.json({
      data: {
        selected_branch: {
          id: branch.id,
          code: branch.code,
          name: branch.name
        },
        next_step: "employee"
      },
      error: null
    });
    writePreEntryFlowState(response, nextFlow);

    const { ipAddress, userAgent } = getRequestMeta(request);
    runInBackground(() =>
      writeAuditLog({
        tenantId: flow.tenantId,
        branchId: branch.id,
        actorRole: "system",
        action: "branch_selected",
        targetType: "branch",
        targetId: branch.id,
        ipAddress,
        userAgent,
        metadata: {
          branch_code: branch.code,
          branch_name: branch.name
        }
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
    console.error("[auth/branches/select] unexpected error", {
      tenantId: flow.tenantId,
      branchId,
      error: error instanceof Error ? error.message : "Unknown error"
    });
    return withTimingHeaders(
      NextResponse.json(
        { data: null, error: { code: "branch_select_failed", message: "ไม่สามารถเลือกสาขาได้" } },
        { status: 500 }
      ),
      startedAt
    );
  }
}
