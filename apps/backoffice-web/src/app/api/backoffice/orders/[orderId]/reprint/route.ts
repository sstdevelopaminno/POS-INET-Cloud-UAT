import { getAuthContext } from "@/lib/auth-context";
import { fail, ok } from "@/lib/http";
import { reprintOrderReceipt } from "@/lib/printing/print-service";

export async function POST(_req: Request, context: { params: Promise<{ orderId: string }> }) {
  try {
    const auth = await getAuthContext({ requireBranchScope: true });
    const { orderId } = await context.params;
    if (!orderId?.trim()) {
      return fail("invalid_order_id", "orderId is required.", 422);
    }

    const result = await reprintOrderReceipt(auth, orderId);
    return ok(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    if (message === "forbidden_role") {
      return fail("forbidden_role", "Only manager or owner can reprint receipt.", 403);
    }
    if (message === "order_not_found") {
      return fail("order_not_found", "Order was not found in this branch.", 404);
    }
    return fail("reprint_failed", message, 400);
  }
}
