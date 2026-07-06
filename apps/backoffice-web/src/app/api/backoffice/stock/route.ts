import { getAuthContext } from "@/lib/auth-context";
import { featureGateFail, requirePosApiFeature } from "@/lib/pos-api-feature-guard";
import { getSupabaseServiceClient } from "@/lib/supabase-admin";
import { buildPaginationMeta, parseBool, parsePagination, sanitizeSearchTerm } from "@/lib/query-params";
import { fail, ok } from "@/lib/http";

const ARCHIVED_INGREDIENT_PREFIX = "__archived__:";
const FALLBACK_INGREDIENT_PREFIX = "STOCK:";

export async function GET(req: Request) {
  try {
    const auth = await getAuthContext({ requireBranchScope: true });
    await requirePosApiFeature(auth, "stock_management");
    const supabase = getSupabaseServiceClient();
    const { searchParams } = new URL(req.url);
    const { page, pageSize } = parsePagination(searchParams, 10);
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    const view = searchParams.get("view")?.trim() || "ingredients";
    const search = sanitizeSearchTerm(searchParams.get("search"));
    const movementType = searchParams.get("movement_type")?.trim();
    const lowStock = parseBool(searchParams.get("low_stock"));
    const branchId = searchParams.get("branch_id")?.trim();

    if (branchId && branchId !== auth.branchId) {
      return fail("forbidden_branch_scope", "Cross-branch access is not allowed.", 403);
    }

    if (view === "movements") {
      let query = supabase
        .from("stock_movements")
        .select(
          "id,tenant_id,branch_id,ingredient_id,movement_type,quantity_delta,reason,ref_table,ref_id,approval_id,created_by,created_at,ingredients(name)",
          { count: "exact" }
        )
        .eq("tenant_id", auth.tenantId!)
        .eq("branch_id", auth.branchId!)
        .order("created_at", { ascending: false })
        .range(from, to);

      if (movementType) {
        query = query.eq("movement_type", movementType);
      }

      if (search) {
        query = query.or(`reason.ilike.%${search}%`);
      }

      const { data, error, count } = await query;
      if (error) {
        return fail("stock_movements_query_failed", error.message, 500);
      }

      return ok({
        view: "movements",
        items: data ?? [],
        pagination: buildPaginationMeta(page, pageSize, count)
      });
    }

    let ingredientsQuery = supabase
      .from("ingredients")
      .select("id,tenant_id,branch_id,name,base_unit,quantity_on_hand,reorder_level,updated_at", { count: "exact" })
      .eq("tenant_id", auth.tenantId!)
      .eq("branch_id", auth.branchId!)
      .not("name", "ilike", `${ARCHIVED_INGREDIENT_PREFIX}%`)
      .not("name", "ilike", `${FALLBACK_INGREDIENT_PREFIX}%`)
      .order("updated_at", { ascending: false })
      .range(from, to);

    if (search) {
      ingredientsQuery = ingredientsQuery.ilike("name", `%${search}%`);
    }

    if (lowStock === true) {
      ingredientsQuery = ingredientsQuery.filter("quantity_on_hand", "lte", "reorder_level");
    }

    const { data, error, count } = await ingredientsQuery;
    if (error) {
      return fail("ingredients_query_failed", error.message, 500);
    }

    return ok({
      view: "ingredients",
      items: data ?? [],
      pagination: buildPaginationMeta(page, pageSize, count)
    });
  } catch (error) {
    const featureError = featureGateFail(error);
    if (featureError) return featureError;
    return fail("unauthorized", error instanceof Error ? error.message : "Authentication failed.", 401);
  }
}
