import { DashboardCards } from "@/components/dashboard/dashboard-cards";
import { getCurrentLanguage } from "@/lib/i18n";

export default async function DashboardPage() {
  const lang = await getCurrentLanguage();

  return (
    <div className="grid" style={{ gap: 18 }}>
      <DashboardCards lang={lang} />
      <section className="surface">
        <h3>Branch Snapshot</h3>
        <p>ยอดขายวันนี้แยกตามช่องทาง, รายการค้างทำ, สถานะกะ, และแจ้งเตือนสต๊อกต่ำ</p>
      </section>
    </div>
  );
}

