import {
  createDeviceToken,
  CUSTOMER_DISPLAY_DEVICE_TOKEN_TTL_DAYS,
  hashSecret,
  normalizePairCode
} from "@/lib/customer-display-pairing";
import { fail, ok } from "@/lib/http";
import {
  countActivePairedDevices,
  deactivateExpiredAndInactiveDevices,
  getCustomerDisplayPolicy
} from "@/lib/services/customer-display-policy-service";
import { getSupabaseServiceClient } from "@/lib/supabase-admin";

type ClaimPairingBody = {
  pairing_code?: string;
  device_name?: string;
};

type PairingRow = {
  id: string;
  tenant_id: string;
  branch_id: string;
  channel: string;
  pair_code_expires_at: string;
  pair_code_used_at: string | null;
  is_active: boolean;
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
    const supabase = getSupabaseServiceClient();
    const body = (await req.json().catch(() => null)) as ClaimPairingBody | null;
    if (!body || typeof body !== "object") {
      return fail("invalid_json", "Request body must be valid JSON.", 400);
    }
    const pairingCode = normalizePairCode(body.pairing_code);
    if (pairingCode.length !== 6) {
      return fail("invalid_pairing_code", "Pairing code must be 6 digits.", 422);
    }

    const pairCodeHash = hashSecret(pairingCode);
    const nowIso = new Date().toISOString();
    const { data: pairing, error: pairingError } = await supabase
      .from("pos_customer_display_pairings")
      .select("id,tenant_id,branch_id,channel,pair_code_expires_at,pair_code_used_at,is_active")
      .eq("pair_code_hash", pairCodeHash)
      .eq("is_active", true)
      .is("pair_code_used_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<PairingRow>();

    if (pairingError) {
      if (isSchemaMissingError(pairingError.message)) {
        return fail(
          "customer_display_unavailable",
          "Customer display database tables are not ready. Run latest migrations and refresh schema cache.",
          503
        );
      }
      return fail("pairing_lookup_failed", pairingError.message, 500);
    }
    if (!pairing) {
      return fail("pairing_not_found", "Pairing code is invalid or expired.", 404);
    }
    if (new Date(pairing.pair_code_expires_at).getTime() <= Date.now()) {
      return fail("pairing_expired", "Pairing code is expired.", 410);
    }

    const scope = {
      tenantId: pairing.tenant_id,
      branchId: pairing.branch_id,
      channel: pairing.channel
    };
    const policy = await getCustomerDisplayPolicy(supabase, scope);
    await deactivateExpiredAndInactiveDevices({
      supabase,
      scope,
      policy
    });

    const activeCount = await countActivePairedDevices({
      supabase,
      scope
    });
    if (activeCount >= policy.maxActiveDevices) {
      return fail(
        "pairing_device_limit_reached",
        `Channel has reached max active devices (${policy.maxActiveDevices}). Revoke an old device first.`,
        409
      );
    }

    const deviceToken = createDeviceToken();
    const deviceTokenHash = hashSecret(deviceToken);
    const deviceTokenExpiresAt = new Date(Date.now() + CUSTOMER_DISPLAY_DEVICE_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();

    const { error: updateError } = await supabase
      .from("pos_customer_display_pairings")
      .update({
        pair_code_used_at: nowIso,
        device_token_hash: deviceTokenHash,
        device_token_expires_at: deviceTokenExpiresAt,
        device_name: body.device_name?.trim() || null,
        last_seen_at: nowIso
      })
      .eq("id", pairing.id)
      .is("pair_code_used_at", null);

    if (updateError) {
      if (isConflictError(updateError)) {
        return fail("pairing_claim_conflict", "Pairing token conflict. Please claim again.", 409);
      }
      return fail("pairing_claim_failed", updateError.message, 500);
    }

    return ok({
      tenant_id: pairing.tenant_id,
      branch_id: pairing.branch_id,
      channel: pairing.channel,
      device_token: deviceToken,
      expires_at: deviceTokenExpiresAt
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
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
    return fail("pairing_claim_failed", message, 500);
  }
}
