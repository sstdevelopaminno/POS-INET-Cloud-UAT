import { allPosMenuFeatureCodes } from "@/lib/pos-feature-map";
import { fail, ok } from "@/lib/http";
import { requirePosSession, PosGuardError } from "@/lib/pos-session-guard";
import { hasBranchFeatureSafe } from "@/lib/server/feature-gate-safe";

export async function GET() {
  try {
    const scope = await requirePosSession();
    const entries = await Promise.all(
      allPosMenuFeatureCodes().map(async (feature) => [
        feature,
        await hasBranchFeatureSafe(scope.session.tenant_id, scope.session.branch_id, feature)
      ] as const)
    );

    return ok({
      tenant_id: scope.session.tenant_id,
      branch_id: scope.session.branch_id,
      features: Object.fromEntries(entries)
    });
  } catch (error) {
    if (error instanceof PosGuardError) {
      return fail(error.code, error.message, error.status);
    }
    return fail("pos_features_failed", error instanceof Error ? error.message : "Unable to load POS features.", 500);
  }
}
