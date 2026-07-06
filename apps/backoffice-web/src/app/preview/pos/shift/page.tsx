import { PosShiftHistoryModule } from "@/components/pos/pos-shift-history-module";
import { getCurrentLanguage } from "@/lib/i18n";
import { requirePosPagePermission } from "@/lib/pos-page-guard";

export default async function PosShiftPage() {
  await requirePosPagePermission("shift:join");
  const lang = await getCurrentLanguage();
  return <PosShiftHistoryModule lang={lang} />;
}

