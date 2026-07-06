import { getPosApiAuthContext } from "@/lib/pos-api-auth";
import { featureGateFail, requirePosApiFeature } from "@/lib/pos-api-feature-guard";
import { fail, ok } from "@/lib/http";
import { loadPosSalesListData } from "@/lib/services/pos-sales-list-service";

export async function GET() {
  try {
    const auth = await getPosApiAuthContext({ requireBranchScope: true, requiredPermission: "sales:list:view" });
    await requirePosApiFeature(auth, "advanced_sales_reports");
    const payload = await loadPosSalesListData({
      userId: auth.userId,
      tenantId: auth.tenantId,
      branchId: auth.branchId,
      branchRole: auth.branchRole,
      platformRole: auth.platformRole
    });
    return ok(payload);
  } catch (error) {
    const featureError = featureGateFail(error);
    if (featureError) return featureError;
    return fail("sales_list_fetch_failed", error instanceof Error ? error.message : "Failed to fetch sales list.", 401);
  }
}
