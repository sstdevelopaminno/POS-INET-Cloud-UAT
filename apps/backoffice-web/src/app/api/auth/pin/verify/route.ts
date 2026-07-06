import { verifyPinLogin } from "@/lib/server/auth-verification";
import { handleMethodVerification } from "@/lib/server/auth-flow";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as
    | {
        ctx?: string;
        pin?: string;
        user_identifier?: string;
      }
    | null;

  const ctx = String(body?.ctx ?? "").trim() || null;
  return handleMethodVerification(request, {
    ctx,
    method: "pin",
    requiredFeatureKey: "pin_login",
    methodPolicyGuard: (validated) => {
      if (!validated.policy.allow_pin_login) {
        return { code: "login_method_not_allowed", message: "PIN login is disabled by branch policy." };
      }
      return true;
    },
    methodVerifier: (validated) =>
      verifyPinLogin({
        tenantId: validated.tenant.id,
        branchId: validated.branch.id,
        pin: String(body?.pin ?? ""),
        userIdentifier: String(body?.user_identifier ?? "").trim() || null
      })
  });
}
