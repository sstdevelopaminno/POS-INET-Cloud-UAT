import Image from "next/image";

export function IposBrand({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`ipos-brand ${compact ? "ipos-brand-compact" : ""}`}>
      <Image src="/brand/sst-ipos-logo-new.png" alt="SST iPOS" width={compact ? 220 : 320} height={compact ? 92 : 134} style={{ height: "auto" }} priority />
    </div>
  );
}
