import { PosSettingsWorkspace } from "@/components/pos-preview/pos-settings-workspace";
import { getCurrentLanguage } from "@/lib/i18n";
import { requirePosPagePermission } from "@/lib/pos-page-guard";
import { loadPosSettingsSnapshot } from "@/lib/services/pos-settings-service";

export default async function PosLanguageSettingsPage() {
  const scope = await requirePosPagePermission("settings:view");
  const lang = await getCurrentLanguage();
  const initialData = await loadPosSettingsSnapshot({
    userId: scope.session.user_id,
    tenantId: scope.session.tenant_id,
    branchId: scope.session.branch_id,
    branchRole: scope.session.role === "owner" || scope.session.role === "manager" || scope.session.role === "accountant" ? scope.session.role : "staff",
    platformRole: "tenant_user"
  });

  return <PosSettingsWorkspace lang={lang} initialData={initialData} />;
}
