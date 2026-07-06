import { requiresPinApproval } from "@pos/pos-domain";
import { getAuthContext } from "@/lib/auth-context";
import { appendAuditLog } from "@/lib/audit-log";
import { featureGateFail, requirePosApiFeature } from "@/lib/pos-api-feature-guard";
import { executeStockAdjustmentTransaction } from "@/lib/services/stock-transaction-service";
import { ok, fail } from "@/lib/http";

export async function POST(req: Request) {
  try {
    const auth = await getAuthContext({ requireBranchScope: true });
    await requirePosApiFeature(auth, "stock_management");
    const body = (await req.json()) as {
      ingredient_id: string;
      quantity_delta: number;
      reason: string;
      approval_id?: string;
    };

    if (requiresPinApproval("stock_adjustment") && !body.approval_id) {
      return fail("approval_required", "Stock adjustment requires manager/owner PIN approval.", 403);
    }

    const requestId = req.headers.get("x-idempotency-key")?.trim() || undefined;

    const result = await executeStockAdjustmentTransaction({
      auth,
      input: {
        ingredient_id: body.ingredient_id,
        quantity_delta: body.quantity_delta,
        reason: body.reason,
        approval_id: body.approval_id!,
        request_id: requestId
      },
      appendAuditLog
    });

    if (!result.ok) {
      return fail(result.code, result.message, result.status);
    }

    return ok(result.data, result.data.duplicate_request ? 200 : 201);
  } catch (error) {
    const featureError = featureGateFail(error);
    if (featureError) return featureError;
    return fail("unauthorized", error instanceof Error ? error.message : "Authentication failed.", 401);
  }
}

