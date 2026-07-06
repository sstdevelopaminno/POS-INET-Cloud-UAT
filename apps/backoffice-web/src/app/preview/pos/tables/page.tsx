import { TableManagementPage } from "@/components/tables/table-management-page";
import { getCurrentLanguage } from "@/lib/i18n";
import { requirePosPagePermission } from "@/lib/pos-page-guard";

export default async function PosTablesPage() {
  const scope = await requirePosPagePermission("tables:manage");
  const lang = await getCurrentLanguage();
  return <TableManagementPage lang={lang} initialRole={scope.session.role} />;
}
