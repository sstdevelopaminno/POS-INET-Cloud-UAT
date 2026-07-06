import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSupabaseServiceClient } from "@/lib/supabase-admin";
import { AuthTimeoutError, withAuthTimeout } from "@/lib/server/auth-timeout";
import { readPreEntryFlowState } from "@/lib/server/pre-entry-state";

type BranchSummary = {
  id: string;
  code: string | null;
  name: string | null;
  address: string | null;
  is_active: boolean;
};

function withTimingHeaders<T extends NextResponse>(response: T, startedAt: number): T {
  const durationMs = Date.now() - startedAt;
  response.headers.set("x-auth-api-ms", String(durationMs));
  response.headers.set("server-timing", `total;dur=${durationMs}`);
  return response;
}

export async function GET() {
  const startedAt = Date.now();
  const cookieStore = await cookies();
  const flow = readPreEntryFlowState(cookieStore);
  if (!flow || (flow.stage !== "store_verified" && flow.stage !== "branch_selected" && flow.stage !== "employee_verified")) {
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
    const { data: branchRows, error: branchError } = await withAuthTimeout(
      supabase
        .from("branches")
        .select("id,code,name,address,is_active")
        .eq("tenant_id", flow.tenantId)
        .eq("is_active", true)
        .order("name", { ascending: true }),
      "branches_lookup_timeout"
    );

    if (branchError) {
      return withTimingHeaders(
        NextResponse.json(
          { data: null, error: { code: "branch_query_failed", message: "ไม่สามารถโหลดรายการสาขาได้" } },
          { status: 500 }
        ),
        startedAt
      );
    }

    const branches = ((branchRows ?? []) as BranchSummary[])
      .filter((branch) => branch.is_active)
      .map((branch) => ({
        id: branch.id,
        code: branch.code,
        name: branch.name,
        address: branch.address
      }));

    return withTimingHeaders(
      NextResponse.json({
        data: {
          tenant: {
            code: flow.storeCode,
            name: flow.tenantName
          },
          selected_branch_id: flow.branchId ?? null,
          branches
        },
        error: null
      }),
      startedAt
    );
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
    console.error("[auth/branches] unexpected error", {
      tenantId: flow.tenantId,
      error: error instanceof Error ? error.message : "Unknown error"
    });
    return withTimingHeaders(
      NextResponse.json(
        { data: null, error: { code: "branch_query_failed", message: "ไม่สามารถโหลดรายการสาขาได้" } },
        { status: 500 }
      ),
      startedAt
    );
  }
}
