import { PosEntryGate } from "@/components/pos/pos-entry-gate";
import { getCurrentLanguage } from "@/lib/i18n";
import { requirePosPagePermission } from "@/lib/pos-page-guard";

export default async function PosPreviewPage() {
  await requirePosPagePermission("sale:create", "/login/store");
  const lang = await getCurrentLanguage();

  return (
    <main className="h-full min-h-0 w-full">
      <PosEntryGate lang={lang} />
    </main>
  );
}

