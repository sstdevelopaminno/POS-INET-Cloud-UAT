import { PosReceiptsWorkspace } from "@/components/pos-preview/pos-receipts-workspace";
import { getCurrentLanguage } from "@/lib/i18n";
import { requirePosPagePermission } from "@/lib/pos-page-guard";

export default async function PosReceiptsPage() {
  await requirePosPagePermission("receipts:view");
  const lang = await getCurrentLanguage();

  return <PosReceiptsWorkspace lang={lang} />;
}
