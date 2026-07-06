import { getPosApiAuthContext } from "@/lib/pos-api-auth";
import {
  createPairingCode,
  CUSTOMER_DISPLAY_PAIR_CODE_TTL_MINUTES,
  hashSecret,
  normalizeDisplayChannel
} from "@/lib/customer-display-pairing";
import { fail, ok } from "@/lib/http";
import { deactivateExpiredAndInactiveDevices, getCustomerDisplayPolicy } from "@/lib/services/customer-display-policy-service";
import { getSupabaseServiceClient } from "@/lib/supabase-admin";

type CreatePairingBody = {
  channel?: string;
};

function isSchemaMissingError(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("does not exist") ||
    normalized.includes("pgrst") ||
    normalized.includes("undefined table") ||
    normalized.includes("undefined column") ||
    normalized.includes("schema cache") ||
    normalized.includes("could not find the table")
  );
}

function isConflictError(error: unknown): boolean {
  const raw = error as { code?: string; message?: string } | null;
  const message = String(raw?.message ?? "").toLowerCase();
  return raw?.code === "23505" || message.includes("duplicate key value") || message.includes("unique constraint");
}

export async function POST(req: Request) {
  try {
    const auth = await getPosApiAuthContext({ requireBranchScope: true, requiredPermission: "customer_display:manage" });
    const supabase = getSupabaseServiceClient();
    const body = (await req.json().catch(() => null)) as CreatePairingBody | null;
    if (!body || typeof body !== "object") {
      return fail("invalid_json", "Request body must be valid JSON.", 400);
    }

    const channel = normalizeDisplayChannel(body.channel ?? "main");
    const policyScope = {
      tenantId: auth.tenantId!,
      branchId: auth.branchId!,
      channel
    };
    const policy = await getCustomerDisplayPolicy(supabase, policyScope);
    await deactivateExpiredAndInactiveDevices({
      supabase,
      scope: policyScope,
      policy
    });

    const pairingCode = createPairingCode();
    const pairCodeHash = hashSecret(pairingCode);
    const expiresAt = new Date(Date.now() + CUSTOMER_DISPLAY_PAIR_CODE_TTL_MINUTES * 60_000).toISOString();

    const { error } = await supabase.from("pos_customer_display_pairings").insert({
      tenant_id: auth.tenantId!,
      branch_id: auth.branchId!,
      channel,
      pair_code_hash: pairCodeHash,
      pair_code_expires_at: expiresAt,
      created_by: auth.userId,
      is_active: true
    });

    if (error) {
      if (isSchemaMissingError(error.message)) {
        return fail(
          "customer_display_unavailable",
          "Customer display database tables are not ready. Run latest migrations and refresh schema cache.",
          503
        );
      }
      if (isConflictError(error)) {
        return fail("customer_display_pairing_conflict", "Pairing code conflict. Please retry.", 409);
      }
      return fail("customer_display_pairing_create_failed", error.message, 500);
    }

    return ok({
      channel,
      pairing_code: pairingCode,
      expires_at: expiresAt
    }, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    if (message.includes("not authenticated") || message.includes("authenticated")) {
      return fail("customer_display_pairing_unauthorized", message, 401);
    }
    const policyErrorPrefix = "customer_display_policy_query_failed:";
    if (
      isSchemaMissingError(message) ||
      (message.startsWith(policyErrorPrefix) && isSchemaMissingError(message.slice(policyErrorPrefix.length)))
    ) {
      return fail(
        "customer_display_unavailable",
        "Customer display database tables are not ready. Run latest migrations and refresh schema cache.",
        503
      );
    }
    return fail("customer_display_pairing_create_failed", message, 500);
  }
}
