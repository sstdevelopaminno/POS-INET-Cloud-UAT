import { DEFAULT_DELIVERY_CHANNEL_CONFIGS, parseDeliveryChannel } from "@/lib/delivery-pricing";
import { fail, ok } from "@/lib/http";
import { buildPaginationMeta, parsePagination, sanitizeSearchTerm } from "@/lib/query-params";
import { getAuthContext } from "@/lib/auth-context";
import { getSupabaseServiceClient } from "@/lib/supabase-admin";

type UpsertConfigPayload = {
  action: "upsert_config";
  channel: string;
  commission_rate_pct: number;
  commission_vat_rate_pct?: number;
  order_code_rule?: "free_text" | "regex";
  order_code_regex?: string | null;
  order_code_example?: string | null;
  source_title?: string | null;
  source_url?: string | null;
  source_checked_at?: string | null;
  effective_from?: string | null;
  effective_to?: string | null;
  is_active?: boolean;
};

type UpsertPricePayload = {
  action: "upsert_price";
  product_id: string;
  channel: string;
  app_price: number;
  is_active?: boolean;
};

type SeedDefaultsPayload = {
  action: "seed_defaults";
};

export async function GET(req: Request) {
  try {
    const auth = await getAuthContext({ requireBranchScope: true });
    const supabase = getSupabaseServiceClient();
    const { searchParams } = new URL(req.url);
    const view = searchParams.get("view")?.trim() || "configs";
    const branchId = searchParams.get("branch_id")?.trim();

    if (branchId && branchId !== auth.branchId) {
      return fail("forbidden_branch_scope", "Cross-branch access is not allowed.", 403);
    }

    if (view === "prices") {
      const { page, pageSize } = parsePagination(searchParams, 20);
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;
      const channel = parseDeliveryChannel(searchParams.get("channel")?.trim() ?? null);
      const search = sanitizeSearchTerm(searchParams.get("search"));

      let query = supabase
        .from("product_channel_prices")
        .select("id,product_id,channel,app_price,is_active,updated_at,products(name,sku,price)", { count: "exact" })
        .eq("tenant_id", auth.tenantId!)
        .eq("branch_id", auth.branchId!)
        .order("updated_at", { ascending: false })
        .range(from, to);

      if (channel) {
        query = query.eq("channel", channel);
      }
      if (search) {
        query = query.or(`products.name.ilike.%${search}%,products.sku.ilike.%${search}%`);
      }

      const { data, error, count } = await query;
      if (error) {
        return fail("delivery_prices_query_failed", error.message, 500);
      }

      return ok({
        view: "prices",
        items: data ?? [],
        pagination: buildPaginationMeta(page, pageSize, count)
      });
    }

    const { data, error } = await supabase
      .from("delivery_channel_configs")
      .select(
        "id,channel,commission_rate_pct,commission_vat_rate_pct,order_code_rule,order_code_regex,order_code_example,source_title,source_url,source_checked_at,effective_from,effective_to,is_active,updated_at"
      )
      .eq("tenant_id", auth.tenantId!)
      .eq("branch_id", auth.branchId!)
      .order("channel", { ascending: true });

    if (error) {
      return fail("delivery_configs_query_failed", error.message, 500);
    }

    const fallbackItems = DEFAULT_DELIVERY_CHANNEL_CONFIGS.map((entry) => ({
      channel: entry.channel,
      commission_rate_pct: entry.commissionRatePct,
      commission_vat_rate_pct: entry.commissionVatRatePct,
      order_code_rule: entry.orderCodeRule,
      order_code_regex: entry.orderCodeRegex,
      order_code_example: entry.orderCodeExample,
      source_title: entry.sourceTitle,
      source_url: entry.sourceUrl,
      source_checked_at: entry.sourceCheckedAt,
      is_active: true,
      updated_at: null
    }));
    const resolvedItems = (data ?? []).length > 0 ? data : fallbackItems;

    return ok({
      view: "configs",
      items: resolvedItems,
      pagination: buildPaginationMeta(1, Math.max(resolvedItems.length, 1), resolvedItems.length)
    });
  } catch (error) {
    return fail("unauthorized", error instanceof Error ? error.message : "Authentication failed.", 401);
  }
}

export async function POST(req: Request) {
  try {
    const auth = await getAuthContext({ requireBranchScope: true });
    const supabase = getSupabaseServiceClient();
    const body = (await req.json()) as UpsertConfigPayload | UpsertPricePayload | SeedDefaultsPayload;

    if (body.action === "seed_defaults") {
      const rows = DEFAULT_DELIVERY_CHANNEL_CONFIGS.map((entry) => ({
        tenant_id: auth.tenantId!,
        branch_id: auth.branchId!,
        channel: entry.channel,
        commission_rate_pct: entry.commissionRatePct,
        commission_vat_rate_pct: entry.commissionVatRatePct,
        order_code_rule: entry.orderCodeRule,
        order_code_regex: entry.orderCodeRegex,
        order_code_example: entry.orderCodeExample,
        source_title: entry.sourceTitle,
        source_url: entry.sourceUrl,
        source_checked_at: entry.sourceCheckedAt,
        is_active: true,
        updated_by: auth.userId
      }));

      const { error } = await supabase.from("delivery_channel_configs").upsert(rows, {
        onConflict: "tenant_id,branch_id,channel"
      });
      if (error) {
        return fail("delivery_configs_seed_failed", error.message, 500);
      }
      return ok({ seeded: rows.length });
    }

    if (body.action === "upsert_config") {
      const channel = parseDeliveryChannel(body.channel);
      if (!channel) {
        return fail("invalid_channel", "Channel is invalid.", 422);
      }

      const commissionRate = Number(body.commission_rate_pct);
      const vatRate = Number(body.commission_vat_rate_pct ?? 7);
      if (!Number.isFinite(commissionRate) || commissionRate < 0 || commissionRate > 100) {
        return fail("invalid_commission_rate", "commission_rate_pct must be in range 0-100.", 422);
      }
      if (!Number.isFinite(vatRate) || vatRate < 0 || vatRate > 100) {
        return fail("invalid_vat_rate", "commission_vat_rate_pct must be in range 0-100.", 422);
      }

      const payload = {
        tenant_id: auth.tenantId!,
        branch_id: auth.branchId!,
        channel,
        commission_rate_pct: Number(commissionRate.toFixed(3)),
        commission_vat_rate_pct: Number(vatRate.toFixed(3)),
        order_code_rule: body.order_code_rule ?? "free_text",
        order_code_regex: body.order_code_regex?.trim() || null,
        order_code_example: body.order_code_example?.trim() || null,
        source_title: body.source_title?.trim() || null,
        source_url: body.source_url?.trim() || null,
        source_checked_at: body.source_checked_at ?? null,
        effective_from: body.effective_from ?? null,
        effective_to: body.effective_to ?? null,
        is_active: body.is_active ?? true,
        updated_by: auth.userId
      };

      const { data, error } = await supabase
        .from("delivery_channel_configs")
        .upsert(payload, { onConflict: "tenant_id,branch_id,channel" })
        .select(
          "id,channel,commission_rate_pct,commission_vat_rate_pct,order_code_rule,order_code_regex,order_code_example,source_title,source_url,source_checked_at,effective_from,effective_to,is_active,updated_at"
        )
        .single();

      if (error) {
        return fail("delivery_config_upsert_failed", error.message, 500);
      }
      return ok(data, 200);
    }

    if (body.action === "upsert_price") {
      const channel = parseDeliveryChannel(body.channel);
      if (!channel) {
        return fail("invalid_channel", "Channel is invalid.", 422);
      }

      const appPrice = Number(body.app_price);
      if (!Number.isFinite(appPrice) || appPrice < 0) {
        return fail("invalid_app_price", "app_price must be a number greater than or equal to 0.", 422);
      }

      const productId = body.product_id?.trim();
      if (!productId) {
        return fail("invalid_product_id", "product_id is required.", 422);
      }

      const { data: product, error: productError } = await supabase
        .from("products")
        .select("id")
        .eq("tenant_id", auth.tenantId!)
        .eq("branch_id", auth.branchId!)
        .eq("id", productId)
        .maybeSingle();

      if (productError) {
        return fail("product_query_failed", productError.message, 500);
      }
      if (!product) {
        return fail("product_not_found", "Product not found in this branch.", 404);
      }

      const payload = {
        tenant_id: auth.tenantId!,
        branch_id: auth.branchId!,
        product_id: productId,
        channel,
        app_price: Number(appPrice.toFixed(2)),
        is_active: body.is_active ?? true,
        updated_by: auth.userId
      };

      const { data, error } = await supabase
        .from("product_channel_prices")
        .upsert(payload, { onConflict: "tenant_id,branch_id,product_id,channel" })
        .select("id,product_id,channel,app_price,is_active,updated_at")
        .single();

      if (error) {
        return fail("delivery_price_upsert_failed", error.message, 500);
      }

      return ok(data, 200);
    }

    return fail("unsupported_action", "Unsupported action.", 422);
  } catch (error) {
    return fail("unauthorized", error instanceof Error ? error.message : "Authentication failed.", 401);
  }
}
