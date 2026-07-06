import { NextResponse } from "next/server";
import { FeatureGateError, requireTenantFeature } from "@/lib/feature-gate";
import { PosGuardError, requireActiveShift, requirePermission, withPosSessionCookie } from "@/lib/pos-session-guard";
import { resolveBranchProducts } from "@/lib/services/pos-sales-mvp-service";

export async function GET() {
  try {
    const { scope, shift } = await requireActiveShift();
    requirePermission(scope, "sales:enter");
    await requireTenantFeature(scope.session.tenant_id, "core_pos_sales", scope.session.branch_id);
    const result = await resolveBranchProducts({
      tenantId: scope.session.tenant_id,
      branchId: scope.session.branch_id
    });

    if (result.error) {
      return NextResponse.json({ data: null, error: { code: "products_query_failed", message: result.error } }, { status: 500 });
    }

    const response = NextResponse.json({
      data: {
        products: result.products,
        shift: {
          id: shift.id,
          status: shift.status,
          opened_at: shift.opened_at
        }
      },
      error: null
    });
    return withPosSessionCookie(response, scope.session.id);
  } catch (error) {
    if (error instanceof FeatureGateError) {
      return NextResponse.json({ data: null, error: { code: error.code, message: error.message } }, { status: error.status });
    }
    if (error instanceof PosGuardError) {
      return NextResponse.json({ data: null, error: { code: error.code, message: error.message } }, { status: error.status });
    }
    return NextResponse.json(
      { data: null, error: { code: "pos_products_failed", message: error instanceof Error ? error.message : "Unknown error." } },
      { status: 500 }
    );
  }
}
