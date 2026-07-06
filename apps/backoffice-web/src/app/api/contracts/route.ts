import { ok } from "@/lib/http";

const contracts = {
  version: "2026-05-18",
  endpoints: [
    {
      method: "GET",
      path: "/api/backoffice/orders",
      description: "List orders with pagination/filter/search (tenant/branch scoped)"
    },
    {
      method: "POST",
      path: "/api/backoffice/orders",
      description: "Create order (including manual delivery channels) with atomic stock deduction",
      headers: {
        "x-idempotency-key": "string? (recommended)"
      },
      request: {
        tenant_id: "uuid",
        branch_id: "uuid",
        shift_id: "uuid",
        channel: "grab | line_man | shopee | merchant_app | other",
        external_order_code: "string",
        customer_name: "string?",
        app_total_amount: "number",
        gp_amount: "number?",
        discount_amount: "number?",
        items: [{ product_id: "uuid", quantity: "number", notes: "string?" }]
      }
    },
    {
      method: "POST",
      path: "/api/backoffice/approvals/pin",
      description: "Scoped PIN approval for cancel bill, stock adjustment, employee delete, and shift override"
    },
    {
      method: "GET",
      path: "/api/backoffice/stock",
      description: "List ingredients or stock movements with pagination/filter/search"
    },
    {
      method: "GET",
      path: "/api/backoffice/catalog",
      description: "List products, ingredients, categories, and recipe lines for product management"
    },
    {
      method: "POST",
      path: "/api/backoffice/catalog",
      description: "Create/update product, ingredient, ingredient restock movement, and recipe lines"
    },
    {
      method: "GET",
      path: "/api/backoffice/delivery-pricing",
      description: "List delivery channel commission config and product channel prices"
    },
    {
      method: "POST",
      path: "/api/backoffice/delivery-pricing",
      description: "Upsert delivery commission config and delivery app prices per product"
    },
    {
      method: "POST",
      path: "/api/backoffice/stock/adjust",
      description: "Adjust ingredient stock with required approval_id and rollback-safe transaction",
      headers: {
        "x-idempotency-key": "string? (recommended)"
      }
    },
    {
      method: "GET",
      path: "/api/backoffice/shifts",
      description: "List shifts with pagination and status filtering"
    },
    {
      method: "POST",
      path: "/api/backoffice/shifts",
      description: "Open new shift for current branch"
    },
    {
      method: "POST",
      path: "/api/backoffice/shifts/close",
      description: "Close shift with rules for unpaid dine-in bills and cash mismatch"
    },
    {
      method: "GET",
      path: "/api/backoffice/audit-logs",
      description: "List audit logs with pagination/filter/search (manager/owner only)"
    },
    {
      method: "GET",
      path: "/api/backoffice/staff",
      description: "List branch staff with pagination/filter/search (manager/owner only)"
    },
    {
      method: "PATCH",
      path: "/api/backoffice/staff",
      description: "Update staff role or active status (manager/owner only)"
    },
    {
      method: "POST",
      path: "/api/it-admin/tenants",
      description: "Create and activate tenant from platform admin"
    },
    {
      method: "GET",
      path: "/api/it-admin/customer-display/devices",
      description: "List paired customer display devices with filters (IT admin only)"
    },
    {
      method: "PATCH",
      path: "/api/it-admin/customer-display/devices",
      description: "Revoke a paired customer display device by pairing_id (IT admin only)"
    },
    {
      method: "GET",
      path: "/api/it-admin/customer-display/policies",
      description: "Read customer display policy for tenant/branch/channel scope (IT admin only)"
    },
    {
      method: "PUT",
      path: "/api/it-admin/customer-display/policies",
      description: "Upsert customer display policy: max active devices + inactive auto-expire hours (IT admin only)"
    },
    {
      method: "GET",
      path: "/api/pos/sales",
      description: "POS sales bootstrap data: active products, categories, current open shift"
    },
    {
      method: "POST",
      path: "/api/pos/sales",
      description: "Create POS order or update existing queued order (when order_id is provided)",
      headers: {
        "x-idempotency-key": "string? (recommended)"
      }
    },
    {
      method: "GET",
      path: "/api/pos/orders",
      description: "List POS orders with nested items/payments and filters"
    },
    {
      method: "POST",
      path: "/api/pos/orders/:orderId/cancel",
      description: "Cancel queued POS bill (approval optional during current POS flow update)"
    },
    {
      method: "GET",
      path: "/api/pos/shift",
      description: "Get current shift state and queued order count"
    },
    {
      method: "POST",
      path: "/api/pos/shift",
      description: "Open/close POS shift with override support for mismatch/unpaid conditions"
    },
    {
      method: "GET",
      path: "/api/pos/payments",
      description: "List payable queued orders for POS payment screen"
    },
    {
      method: "POST",
      path: "/api/pos/payments",
      description: "Complete POS payment with split lines, print receipt, optional kitchen print",
      headers: {
        "x-idempotency-key": "string? (recommended)"
      }
    },
    {
      method: "POST",
      path: "/api/pos/payments/slip-verify",
      description: "Verify transfer slip OCR and persist structured verification record (no image blob)"
    },
    {
      method: "POST",
      path: "/api/pos/perf",
      description: "Write per-route performance sample (client navigation + TTFB) for branch-level bottleneck tracking"
    },
    {
      method: "GET",
      path: "/api/pos/perf",
      description: "Read route performance logs and aggregated summary for current branch (manager/owner/it_admin)"
    }
  ]
};

export async function GET() {
  return ok(contracts);
}

