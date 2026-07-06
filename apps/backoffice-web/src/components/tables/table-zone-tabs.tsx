"use client";

import type { TableZoneItem } from "@/components/tables/types";
import type { Language } from "@/lib/i18n";
import { getTableUiText } from "@/components/tables/table-i18n";

type Props = {
  zones: TableZoneItem[];
  activeZoneId: string;
  onChange: (zoneId: string) => void;
  includeAll?: boolean;
  lang?: Language;
};

export function TableZoneTabs({ zones, activeZoneId, onChange, includeAll = true, lang = "en" }: Props) {
  const text = getTableUiText(lang);
  return (
    <div className="table-zone-tabs" role="tablist" aria-label={`${text.zone} tabs`}>
      {includeAll ? (
        <button
          type="button"
          role="tab"
          className={activeZoneId === "all" ? "is-active" : ""}
          onClick={() => onChange("all")}
        >
          {text.all}
        </button>
      ) : null}
      {zones.map((zone) => (
        <button
          key={zone.id}
          type="button"
          role="tab"
          className={activeZoneId === zone.id ? "is-active" : ""}
          onClick={() => onChange(zone.id)}
          style={{
            borderColor: zone.color
          }}
        >
          {zone.zone_name}
        </button>
      ))}
    </div>
  );
}
