"use client";

type CategoryItem = {
  id: string;
  label: string;
};

type Props = {
  items: CategoryItem[];
  activeId: string;
  onSelect: (id: string) => void;
  ariaLabel?: string;
  trailingActionLabel?: string;
  onTrailingAction?: () => void;
};

export function PosCategoryNav({
  items,
  activeId,
  onSelect,
  ariaLabel = "Product categories",
  trailingActionLabel,
  onTrailingAction
}: Props) {
  return (
    <div className="posui-category-row">
      <nav className="posui-category-nav" aria-label={ariaLabel}>
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onSelect(item.id)}
            className={`posui-chip posui-chip--category ${activeId === item.id ? "is-active" : ""}`}
          >
            {item.label}
          </button>
        ))}
      </nav>
      {trailingActionLabel ? (
        <button type="button" className="posui-chip posui-chip--manage" onClick={onTrailingAction}>
          {trailingActionLabel}
        </button>
      ) : null}
    </div>
  );
}
