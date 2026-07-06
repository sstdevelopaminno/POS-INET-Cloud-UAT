"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { MouseEvent, useEffect, useMemo, useState, useTransition } from "react";
import { t, type Language } from "@/lib/i18n";
import {
  POS_MENU_LOCK_TITLE_EN,
  POS_MENU_LOCK_TITLE_TH,
  featureForPosRoute
} from "@/lib/pos-feature-map";

type IconName = "sales" | "list" | "stock" | "summary" | "receipt" | "tables" | "users" | "display" | "shift" | "logout";
type PosRole = "owner" | "manager" | "staff" | "accountant";

function LockIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}

function MenuIcon({ name }: { name: IconName }) {
  const common = {
    width: 16,
    height: 16,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const
  };

  if (name === "sales") {
    return (
      <svg {...common}>
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <line x1="3" y1="10" x2="21" y2="10" />
      </svg>
    );
  }
  if (name === "list") {
    return (
      <svg {...common}>
        <line x1="9" y1="7" x2="20" y2="7" />
        <line x1="9" y1="12" x2="20" y2="12" />
        <line x1="9" y1="17" x2="20" y2="17" />
        <circle cx="5" cy="7" r="1" />
        <circle cx="5" cy="12" r="1" />
        <circle cx="5" cy="17" r="1" />
      </svg>
    );
  }
  if (name === "stock") {
    return (
      <svg {...common}>
        <rect x="4" y="6" width="16" height="12" rx="2" />
        <path d="M8 10h8" />
        <path d="M8 14h8" />
      </svg>
    );
  }
  if (name === "summary") {
    return (
      <svg {...common}>
        <line x1="4" y1="20" x2="20" y2="20" />
        <rect x="6" y="11" width="3" height="7" />
        <rect x="11" y="8" width="3" height="10" />
        <rect x="16" y="5" width="3" height="13" />
      </svg>
    );
  }
  if (name === "receipt") {
    return (
      <svg {...common}>
        <path d="M7 3h10v18l-2-1-2 1-2-1-2 1-2-1-2 1V3z" />
        <line x1="9" y1="8" x2="15" y2="8" />
        <line x1="9" y1="12" x2="15" y2="12" />
      </svg>
    );
  }
  if (name === "tables") {
    return (
      <svg {...common}>
        <rect x="4" y="6" width="16" height="4" rx="1" />
        <line x1="6" y1="10" x2="6" y2="18" />
        <line x1="18" y1="10" x2="18" y2="18" />
        <line x1="4" y1="18" x2="20" y2="18" />
      </svg>
    );
  }
  if (name === "display") {
    return (
      <svg {...common}>
        <rect x="3" y="5" width="18" height="12" rx="2" />
        <line x1="8" y1="20" x2="16" y2="20" />
        <line x1="12" y1="17" x2="12" y2="20" />
      </svg>
    );
  }
  if (name === "shift") {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="8" />
        <line x1="12" y1="8" x2="12" y2="12" />
        <line x1="12" y1="12" x2="15" y2="14" />
      </svg>
    );
  }
  if (name === "logout") {
    return (
      <svg {...common}>
        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
        <polyline points="16 17 21 12 16 7" />
        <line x1="21" y1="12" x2="9" y2="12" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <circle cx="12" cy="8" r="3" />
      <path d="M5 20c0-3.5 3-6 7-6s7 2.5 7 6" />
    </svg>
  );
}

const MENU_DEFS: Array<{
  key:
    | "pos_menu_sales"
    | "pos_menu_sales_list"
    | "pos_menu_stock"
    | "pos_menu_sales_summary"
    | "pos_menu_receipts"
    | "pos_menu_tables"
    | "pos_menu_shift";
  href: string;
  icon: IconName;
  roles: PosRole[];
  feature: ReturnType<typeof featureForPosRoute>;
}> = [
  { key: "pos_menu_sales", href: "/preview/pos", icon: "sales", roles: ["owner", "manager", "staff"], feature: featureForPosRoute("/preview/pos") },
  { key: "pos_menu_sales_list", href: "/preview/pos/sales-list", icon: "list", roles: ["owner", "manager", "staff"], feature: featureForPosRoute("/preview/pos/sales-list") },
  { key: "pos_menu_stock", href: "/preview/pos/stock", icon: "stock", roles: ["owner", "manager", "accountant"], feature: featureForPosRoute("/preview/pos/stock") },
  { key: "pos_menu_sales_summary", href: "/preview/pos/sales-summary", icon: "summary", roles: ["owner", "manager", "accountant"], feature: featureForPosRoute("/preview/pos/sales-summary") },
  { key: "pos_menu_receipts", href: "/preview/pos/receipts", icon: "receipt", roles: ["owner", "manager", "accountant"], feature: featureForPosRoute("/preview/pos/receipts") },
  { key: "pos_menu_tables", href: "/preview/pos/tables", icon: "tables", roles: ["owner", "manager"], feature: featureForPosRoute("/preview/pos/tables") },
  { key: "pos_menu_shift", href: "/preview/pos/shift", icon: "shift", roles: ["owner", "manager", "staff"], feature: featureForPosRoute("/preview/pos/shift") }
];

function resolveMenuRole(role: PosRole | null): PosRole {
  // Keep menu visible after refresh while session role is still hydrating from API.
  if (!role) return "staff";
  if (role === "accountant") return "manager";
  return role;
}

export function PosStaffMenu({
  lang,
  collapsed,
  sessionRole,
  enabledFeatures,
  onLockedFeature
}: {
  lang: Language;
  collapsed: boolean;
  sessionRole: PosRole | null;
  enabledFeatures: Record<string, boolean> | null;
  onLockedFeature: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const effectiveRole = resolveMenuRole(sessionRole);
  const menuItems = useMemo(
    () =>
      MENU_DEFS.map((item) => ({
        label: t(lang, item.key),
        href: item.href,
        icon: item.icon,
        roles: item.roles,
        feature: item.feature
      })).filter((item) => item.roles.includes(effectiveRole)),
    [effectiveRole, lang]
  );

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!isPending) {
      setPendingHref(null);
    }
  }, [isPending]);

  function handleNavigate(event: MouseEvent<HTMLAnchorElement>, href: string) {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }
    if (pathname === href) {
      event.preventDefault();
      return;
    }
    event.preventDefault();
    setPendingHref(href);
    startTransition(() => {
      router.push(href);
    });
  }

  function handleLockedNavigate(event: MouseEvent<HTMLAnchorElement>) {
    event.preventDefault();
    onLockedFeature();
  }

  return (
    <nav className="mt-2 grid gap-1" aria-label={t(lang, "pos_menu_staff_aria")}>
      {(mounted ? menuItems : []).map((item) => {
        const isActive = pathname === item.href;
        const isNavigating = pendingHref === item.href && isPending;
        const isFeatureLoaded = enabledFeatures !== null;
        const isLocked = Boolean(isFeatureLoaded && item.feature && enabledFeatures?.[item.feature] === false);
        return (
          <Link
            key={item.href}
            href={item.href}
            prefetch={false}
            onClick={(event) => (isLocked ? handleLockedNavigate(event) : handleNavigate(event, item.href))}
            className={`group relative inline-flex min-h-[42px] items-center px-2 text-[13px] font-semibold leading-tight transition ${
              collapsed ? "justify-center" : "justify-start gap-2"
            } ${
              isActive
                ? "rounded-xl border border-cyan-300/45 bg-[linear-gradient(145deg,rgba(59,130,246,0.45),rgba(14,165,233,0.35))] text-white shadow-[0_10px_24px_rgba(14,116,255,0.25),inset_0_1px_0_rgba(255,255,255,0.2)]"
                : isLocked
                  ? "rounded-xl text-slate-400/85 hover:bg-white/5 hover:text-slate-200"
                  : "rounded-xl text-slate-100/90 hover:bg-white/8 hover:text-white"
            } ${isNavigating ? "opacity-80" : ""}`}
            title={collapsed ? item.label : isLocked ? (lang === "th" ? POS_MENU_LOCK_TITLE_TH : POS_MENU_LOCK_TITLE_EN) : undefined}
            aria-busy={isNavigating}
            aria-disabled={isLocked}
          >
            <span className="inline-flex w-4 justify-center" aria-hidden>
              <MenuIcon name={item.icon} />
            </span>
            {!collapsed ? <span className="truncate text-[13px]">{item.label}</span> : null}
            {isLocked ? <span className={`ml-auto inline-flex text-slate-300 ${collapsed ? "absolute right-1 top-1" : ""}`}><LockIcon /></span> : null}
          </Link>
        );
      })}
    </nav>
  );
}
