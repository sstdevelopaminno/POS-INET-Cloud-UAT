import { getAuthContext } from "@/lib/auth-context";
import { fail, ok } from "@/lib/http";
import { getSupabaseServiceClient } from "@/lib/supabase-admin";
import { cookies } from "next/headers";

type PostgrestLikeError = {
  code?: string | null;
  message?: string | null;
};

type UpdateInventorySettingsPayload = {
  allow_negative_stock: boolean;
};

type InventorySettingsResponse = {
  allow_negative_stock: boolean;
  storage_ready: boolean;
  storage_issue?: "missing_table" | "unavailable" | "fallback_cookie";
  storage_message?: string;
};

const POS_ALLOW_NEGATIVE_STOCK_COOKIE = "pos_allow_negative_stock";

function readBoolCookie(value: string | undefined): boolean | null {
  if (value === "1" || value === "true") return true;
  if (value === "0" || value === "false") return false;
  return null;
}

function envFallbackAllowNegativeStock() {
  return process.env.POS_ALLOW_NEGATIVE_STOCK === "1" || process.env.POS_ALLOW_NEGATIVE_STOCK?.toLowerCase() === "true";
}

function isMissingTableError(error: PostgrestLikeError | null | undefined) {
  if (!error) return false;
  const code = String(error.code ?? "");
  const message = String(error.message ?? "").toLowerCase();
  return code === "PGRST205" || message.includes("could not find the table");
}

export async function GET() {
  try {
    const auth = await getAuthContext({ requireBranchScope: true });
    const supabase = getSupabaseServiceClient();
    const cookieStore = await cookies();
    const cookieFallback = readBoolCookie(cookieStore.get(POS_ALLOW_NEGATIVE_STOCK_COOKIE)?.value);
    const fallbackValue = cookieFallback ?? envFallbackAllowNegativeStock();

    const { data, error } = await supabase
      .from("branch_inventory_settings")
      .select("allow_negative_stock")
      .eq("tenant_id", auth.tenantId!)
      .eq("branch_id", auth.branchId!)
      .maybeSingle<{ allow_negative_stock: boolean }>();

    if (error) {
      if (isMissingTableError(error as PostgrestLikeError)) {
        return ok<InventorySettingsResponse>({
          allow_negative_stock: fallbackValue,
          storage_ready: true,
          storage_issue: "fallback_cookie",
          storage_message: "Using temporary fallback setting because inventory settings table is unavailable."
        });
      }
      return ok<InventorySettingsResponse>({
        allow_negative_stock: fallbackValue,
        storage_ready: true,
        storage_issue: "fallback_cookie",
        storage_message: `Using fallback setting: ${error.message}`
      });
    }

    return ok<InventorySettingsResponse>({
      allow_negative_stock: Boolean(data?.allow_negative_stock ?? false),
      storage_ready: true
    });
  } catch (error) {
    return fail("unauthorized", error instanceof Error ? error.message : "Authentication failed.", 401);
  }
}

export async function POST(req: Request) {
  try {
    const auth = await getAuthContext({ requireBranchScope: true });
    const supabase = getSupabaseServiceClient();
    const cookieStore = await cookies();
    const body = (await req.json()) as UpdateInventorySettingsPayload;

    if (typeof body?.allow_negative_stock !== "boolean") {
      return fail("invalid_allow_negative_stock", "allow_negative_stock must be boolean.", 422);
    }

    const payload = {
      tenant_id: auth.tenantId!,
      branch_id: auth.branchId!,
      allow_negative_stock: body.allow_negative_stock,
      updated_by: auth.userId
    };

    const { data, error } = await supabase
      .from("branch_inventory_settings")
      .upsert(payload, { onConflict: "tenant_id,branch_id" })
      .select("allow_negative_stock")
      .single<{ allow_negative_stock: boolean }>();

    if (error) {
      if (isMissingTableError(error as PostgrestLikeError)) {
        cookieStore.set(POS_ALLOW_NEGATIVE_STOCK_COOKIE, body.allow_negative_stock ? "1" : "0", {
          path: "/",
          httpOnly: true,
          sameSite: "lax",
          maxAge: 60 * 60 * 24 * 30
        });
        return ok<InventorySettingsResponse>({
          allow_negative_stock: body.allow_negative_stock,
          storage_ready: true,
          storage_issue: "fallback_cookie",
          storage_message: "Saved with temporary fallback (cookie). Apply migration 202605220005 for database persistence."
        });
      }
      return fail("inventory_settings_update_failed", error.message, 500);
    }

    cookieStore.set(POS_ALLOW_NEGATIVE_STOCK_COOKIE, body.allow_negative_stock ? "1" : "0", {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 30
    });

    return ok({
      allow_negative_stock: Boolean(data?.allow_negative_stock ?? false),
      storage_ready: true
    });
  } catch (error) {
    return fail("unauthorized", error instanceof Error ? error.message : "Authentication failed.", 401);
  }
}
