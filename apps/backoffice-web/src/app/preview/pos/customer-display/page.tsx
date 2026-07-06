import { PosCustomerDisplayModule } from "@/components/pos/pos-customer-display-module";
import { getCurrentLanguage } from "@/lib/i18n";
import { requirePosPagePermission } from "@/lib/pos-page-guard";

export default async function PosPreviewCustomerDisplayPage() {
  await requirePosPagePermission("customer_display:manage");
  const lang = await getCurrentLanguage();
  return <PosCustomerDisplayModule lang={lang} />;
}

