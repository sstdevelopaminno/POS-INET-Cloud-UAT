import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSupabaseServiceClient } from "@/lib/supabase-admin";
import { AuthTimeoutError, withAuthTimeout } from "@/lib/server/auth-timeout";
import { clearPreEntryFlowState, readPreEntryFlowState } from "@/lib/server/pre-entry-state";
import { resolveSessionCookieConfig } from "@/lib/server/pos-session";
import { requirePosSession } from "@/lib/pos-session-guard";

function clearPosSessionCookies(response: NextResponse) {
  const config = resolveSessionCookieConfig();
  response.cookies.set({
    name: config.name,
    value: "",
    httpOnly: true,
    secure: config.secure,
    sameSite: "lax",
    path: "/",
    domain: config.domain,
    maxAge: 0
  });
  response.cookies.set({
    name: config.sessionIdName,
    value: "",
    httpOnly: true,
    secure: config.secure,
    sameSite: "lax",
    path: "/",
    domain: config.domain,
    maxAge: 0
  });
}

async function revokeCurrentPosSessionBestEffort() {
  try {
    const scope = await requirePosSession();
    await withAuthTimeout(
      getSupabaseServiceClient()
        .from("pos_sessions")
        .update({ status: "revoked", revoked_at: new Date().toISOString() })
        .eq("id", scope.session.id)
        .eq("status", "active"),
      "session_context_revoke_timeout",
      3000
    );
  } catch (error) {
    if (error instanceof AuthTimeoutError) {
      console.warn("[auth/session/context] revoke timed out", {
        code: error.code,
        timeoutMs: error.timeoutMs
      });
    }
  }
}

export async function GET() {
  const cookieStore = await cookies();
  const flow = readPreEntryFlowState(cookieStore);
  if (!flow) {
    return NextResponse.json({
      data: {
        stage: "none",
        tenant: null,
        branch: null,
        employee: null,
        permissions: []
      },
      error: null
    });
  }

  return NextResponse.json({
    data: {
      stage: flow.stage,
      tenant: {
        id: flow.tenantId,
        code: flow.storeCode,
        name: flow.tenantName
      },
      branch: flow.branchId
        ? {
            id: flow.branchId,
            code: flow.branchCode ?? null,
            name: flow.branchName ?? null
          }
        : null,
      employee: flow.userId
        ? {
            id: flow.userId,
            name: flow.employeeName ?? null,
            code: flow.employeeCode ?? null,
            role: flow.userRole ?? null,
            method: flow.employeeAuthMethod ?? null
          }
        : null,
      permissions: flow.permissions ?? []
    },
    error: null
  });
}

export async function DELETE() {
  await revokeCurrentPosSessionBestEffort();

  const response = NextResponse.json({
    data: {
      cleared: true
    },
    error: null
  });
  clearPosSessionCookies(response);
  clearPreEntryFlowState(response);
  return response;
}
