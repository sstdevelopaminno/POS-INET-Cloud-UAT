import { TableManagementPage } from "@/components/tables/table-management-page";
import { getCurrentLanguage } from "@/lib/i18n";

export default async function TablesPage() {
  const lang = await getCurrentLanguage();
  return <TableManagementPage lang={lang} />;
}
