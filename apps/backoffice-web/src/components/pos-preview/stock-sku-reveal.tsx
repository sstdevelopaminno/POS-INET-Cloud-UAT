"use client";

import { useEffect, useState } from "react";

function TagIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M20.6 13.4L11 23l-9-9V5h9z" />
      <circle cx="7.5" cy="9.5" r="1.2" />
    </svg>
  );
}

export function StockSkuReveal({ sku, th }: { sku: string | null; th: boolean }) {
  const [showCode, setShowCode] = useState(false);

  useEffect(() => {
    if (!showCode) return;
    const timer = window.setTimeout(() => setShowCode(false), 1500);
    return () => window.clearTimeout(timer);
  }, [showCode]);

  if (!sku) {
    return <span className="text-sm font-semibold text-slate-400">-</span>;
  }

  return (
    <button
      type="button"
      onClick={() => setShowCode(true)}
      className="inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-slate-200 px-2 py-1 text-xs font-bold text-slate-700 transition hover:bg-slate-50"
      aria-label={th ? "แสดงรหัสสินค้า" : "Show product code"}
      title={th ? "แสดงรหัสสินค้า" : "Show product code"}
    >
      <span className="inline-flex h-4 w-4 items-center justify-center">
        <TagIcon />
      </span>
      {showCode ? <span className="text-sm">{sku}</span> : null}
    </button>
  );
}
