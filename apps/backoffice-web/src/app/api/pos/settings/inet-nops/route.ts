import { FeatureGateError } from "@/lib/feature-gate";
import { fail, ok } from "@/lib/http";
import { getPosApiAuthContext } from "@/lib/pos-api-auth";
import {
  loadInetNopsSettings,
  saveInetNopsSettings,
  testInetNopsProviderConnection,
  type SaveInetNopsSettingsInput
} from "@/lib/services/inet-nops-settings-service";

function statusFromError(error: unknown) {
  if (error instanceof FeatureGateError) return { code: error.code, message: error.message, status: error.status };
  const message = error instanceof Error ? error.message : "INET settings request failed.";
  if (message.includes("Only owner")) return { code: "forbidden_role", message, status: 403 };
  if (message.includes("migration")) return { code: "inet_settings_schema_missing", message, status: 500 };
  if (message.includes("required") || message.includes("not configured")) return { code: "invalid_inet_configuration", message, status: 422 };
  return { code: "inet_settings_failed", message, status: 500 };
}

export async function GET(request: Request) {
  try {
    const auth = await getPosApiAuthContext({ requireBranchScope: true, requiredPermission: "settings:view" });
    const branchId = new URL(request.url).searchParams.get("branch_id");
    const settings = await loadInetNopsSettings(auth, branchId);
    return ok({ settings });
  } catch (error) {
    const resolved = statusFromError(error);
    return fail(resolved.code, resolved.message, resolved.status);
  }
}

export async function PUT(request: Request) {
  try {
    const auth = await getPosApiAuthContext({ requireBranchScope: true, requiredPermission: "settings:view" });
    const body = (await request.json()) as SaveInetNopsSettingsInput;
    const settings = await saveInetNopsSettings(auth, body);
    return ok({ settings });
  } catch (error) {
    const resolved = statusFromError(error);
    return fail(resolved.code, resolved.message, resolved.status);
  }
}

export async function POST(request: Request) {
  try {
    const auth = await getPosApiAuthContext({ requireBranchScope: true, requiredPermission: "settings:view" });
    const body = (await request.json().catch(() => ({}))) as { branch_id?: string; action?: string };
    if (body.action !== "test_connection") {
      return fail("invalid_action", "action must be test_connection.", 422);
    }
    const settings = await testInetNopsProviderConnection(auth, body.branch_id);
    return ok({ settings });
  } catch (error) {
    const resolved = statusFromError(error);
    return fail(resolved.code, resolved.message, resolved.status);
  }
}
