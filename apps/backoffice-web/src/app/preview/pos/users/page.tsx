import { PosUsersModule } from "@/components/pos/pos-users-module";
import { getCurrentLanguage } from "@/lib/i18n";
import { requirePosPagePermission } from "@/lib/pos-page-guard";

export default async function PosUsersPage() {
  await requirePosPagePermission("users:view");
  const lang = await getCurrentLanguage();

  return <PosUsersModule lang={lang} />;
}
