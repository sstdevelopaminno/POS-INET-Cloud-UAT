import { PosCustomerDisplayModule } from "@/components/pos/pos-customer-display-module";
import { getCurrentLanguage } from "@/lib/i18n";

export default async function PosCustomerDisplayPage() {
  const lang = await getCurrentLanguage();
  return <PosCustomerDisplayModule lang={lang} />;
}
