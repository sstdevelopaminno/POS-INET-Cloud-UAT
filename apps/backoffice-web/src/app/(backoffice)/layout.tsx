import { AppShell } from "@/components/layout/app-shell";
import type { ReactNode } from "react";
import { getCurrentLanguage, t } from "@/lib/i18n";

const nav = [
  { href: "/dashboard", key: "dashboard" },
  { href: "/orders", key: "orders" },
  { href: "/stock", key: "stock" },
  { href: "/staff", key: "staff" },
  { href: "/reports/sales", key: "sales_report" },
  { href: "/reports/stock", key: "stock_report" },
  { href: "/reports/audit", key: "audit_report" },
  { href: "/delivery", key: "manual_delivery" },
  { href: "/shifts", key: "shifts" },
  { href: "/pos/sales", key: "pos_sales" },
  { href: "/pos/orders", key: "pos_orders" },
  { href: "/pos/shift", key: "pos_shift" },
  { href: "/pos/payments", key: "pos_payments" },
  { href: "/pos/monitor", key: "pos_monitor" },
  { href: "/pos/customer-display", key: "pos_customer_display" },
  { href: "/settings/tables", key: "tables" },
  { href: "/backoffice/settings/printers", key: "printers_settings" },
  { href: "/settings/language", key: "common_settings" }
] as const;

export default async function BackofficeLayout({ children }: { children: ReactNode }) {
  const lang = await getCurrentLanguage();

  return (
    <AppShell
      title={t(lang, "backoffice_title")}
      nav={nav.map((item) => ({ href: item.href, label: t(lang, item.key) }))}
      language={lang}
      languageLabel={t(lang, "language")}
      thaiLabel={t(lang, "thai")}
      englishLabel={t(lang, "english")}
    >
      {children}
    </AppShell>
  );
}

