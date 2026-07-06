import type { AuthContext } from "@/lib/auth-context";
import { getAuthContext } from "@/lib/auth-context";
import { requirePermission, requirePosSession, type PosPermission } from "@/lib/pos-session-guard";

type PosApiAuthInput = {
  requireBranchScope?: boolean;
  requiredPermission?: PosPermission;
  requiredPermissions?: PosPermission[];
};

function normalizeBranchRole(role: string): AuthContext["branchRole"] {
  if (role === "owner" || role === "manager" || role === "staff" || role === "accountant") {
    return role;
  }
  return "staff";
}

export async function getPosApiAuthContext(input: PosApiAuthInput = {}): Promise<AuthContext> {
  const { requireBranchScope = true, requiredPermission, requiredPermissions } = input;
  const permissions = [...(requiredPermission ? [requiredPermission] : []), ...(requiredPermissions ?? [])];

  try {
    const scope = await requirePosSession();
    for (const permission of permissions) {
      requirePermission(scope, permission);
    }
    return {
      userId: scope.session.user_id,
      tenantId: scope.session.tenant_id,
      branchId: scope.session.branch_id,
      branchRole: normalizeBranchRole(scope.session.role),
      platformRole: "tenant_user"
    };
  } catch (error) {
    if (permissions.length > 0) {
      throw error;
    }
    return getAuthContext({ requireBranchScope });
  }
}
