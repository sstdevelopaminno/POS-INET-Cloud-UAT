import { headers } from "next/headers";
import { fail, ok } from "@/lib/http";
import { getPosApiAuthContext } from "@/lib/pos-api-auth";
import { loadActivityAudit, type ActivityAuditInput } from "@/lib/services/activity-audit-service";

function statusFromError(error: unknown) {
  const message = error instanceof Error ? error.message : "Activity audit request failed.";
  if (message.includes("owner or manager")) return { code: "forbidden_role", message, status: 403 };
  if (message.includes("PIN")) return { code: "pin_rejected", message, status: 403 };
  if (message.includes("Missing tenant")) return { code: "missing_scope", message, status: 401 };
  return { code: "activity_audit_failed", message, status: 500 };
}

function readClientIp(headerStore: Headers) {
  const forwarded = headerStore.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || headerStore.get("x-real-ip") || null;
}

export async function POST(request: Request) {
  try {
    const auth = await getPosApiAuthContext({ requireBranchScope: true });
    const body = (await request.json()) as ActivityAuditInput;
    const headerStore = await headers();
    const data = await loadActivityAudit(auth, body, {
      ipAddress: readClientIp(headerStore),
      userAgent: headerStore.get("user-agent")
    });
    return ok(data);
  } catch (error) {
    const resolved = statusFromError(error);
    return fail(resolved.code, resolved.message, resolved.status);
  }
}
