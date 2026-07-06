import { verifyStaffCardLogin } from "@/lib/server/auth-verification";
import { handleMethodVerification } from "@/lib/server/auth-flow";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as
    | {
        ctx?: string;
        staff_card_code?: string;
        card_payload?: unknown;
      }
    | null;

  const ctx = String(body?.ctx ?? "").trim() || null;
  return handleMethodVerification(request, {
    ctx,
    method: "staff_card",
    requiredFeatureKey: "staff_card_login",
    methodPolicyGuard: (validated) => {
      if (!validated.policy.allow_staff_card_login) {
        return { code: "login_method_not_allowed", message: "Staff card login is disabled by branch policy." };
      }
      return true;
    },
    methodVerifier: (validated) =>
      verifyStaffCardLogin({
        tenantId: validated.tenant.id,
        branchId: validated.branch.id,
        staffCardCode: String(body?.staff_card_code ?? "").trim() || null,
        cardPayload: body?.card_payload
      })
  });
}
