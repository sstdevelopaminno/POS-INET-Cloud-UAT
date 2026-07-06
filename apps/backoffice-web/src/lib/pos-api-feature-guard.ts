import "server-only";

import { FeatureGateError, requireTenantFeature } from "@/lib/feature-gate";
import { fail } from "@/lib/http";

type FeatureScope = {
  tenantId?: string | null;
  branchId?: string | null;
};

export async function requirePosApiFeature(scope: FeatureScope, feature: string) {
  await requireTenantFeature(scope.tenantId ?? "", feature, scope.branchId ?? null);
}

export function featureGateFail(error: unknown): Response | null {
  if (!(error instanceof FeatureGateError)) return null;
  if (error.code === "feature_not_enabled") {
    return Response.json(
      {
        ok: false,
        error: "feature_not_enabled",
        feature: error.message.match(/'([^']+)'/)?.[1] ?? null
      },
      { status: 403 }
    );
  }
  return fail(error.code, error.message, error.status);
}
