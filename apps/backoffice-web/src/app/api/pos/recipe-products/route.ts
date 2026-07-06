import { getPosApiAuthContext } from "@/lib/pos-api-auth";
import { fail, ok } from "@/lib/http";
import { getSupabaseServiceClient } from "@/lib/supabase-admin";

type PostgrestLikeError = {
  code?: string | null;
  message?: string | null;
  details?: string | null;
  hint?: string | null;
};

function isMissingRecipesSchemaError(error: PostgrestLikeError | null | undefined): boolean {
  if (!error) return false;
  const code = String(error.code ?? "");
  const text = `${error.message ?? ""} ${error.details ?? ""} ${error.hint ?? ""}`.toLowerCase();
  if (code === "42P01" || code === "PGRST205") return true;
  return text.includes("recipes");
}

function normalizeProductId(value: string | null | undefined): string {
  return String(value ?? "").trim();
}

export async function GET(req: Request) {
  try {
    const auth = await getPosApiAuthContext({ requireBranchScope: true, requiredPermission: "sales:enter" });
    const supabase = getSupabaseServiceClient();
    const url = new URL(req.url);
    const rawProductIds = String(url.searchParams.get("product_ids") ?? "");
    const productIds = Array.from(
      new Set(
        rawProductIds
          .split(",")
          .map((entry) => normalizeProductId(entry))
          .filter(Boolean)
      )
    ).slice(0, 250);

    if (productIds.length === 0) {
      return ok({ product_ids: [] as string[] });
    }

    const { data, error } = await supabase
      .from("recipes")
      .select("product_id")
      .eq("tenant_id", auth.tenantId!)
      .eq("branch_id", auth.branchId!)
      .in("product_id", productIds);

    if (error) {
      if (isMissingRecipesSchemaError(error)) {
        return ok({ product_ids: [] as string[] });
      }
      return fail("recipe_products_query_failed", error.message, 500);
    }

    const recipeProductIds = Array.from(
      new Set(
        (data ?? [])
          .map((row) => normalizeProductId(String(row.product_id ?? "")))
          .filter(Boolean)
      )
    );

    return ok({
      product_ids: recipeProductIds
    });
  } catch (error) {
    return fail("pos_recipe_products_failed", error instanceof Error ? error.message : "Unknown error", 400);
  }
}
