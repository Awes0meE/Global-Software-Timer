import { useEffect, useRef, type KeyboardEvent } from "react";
import { ChevronDown, FileDown, FileSpreadsheet, type LucideIcon } from "lucide-react";
import { UnavailableTooltip } from "./UnavailableTooltip";
import { usePixelSnap, usePopover } from "./usePopover";
import "./HeaderControls.css";

export interface ExportKeyItem<Id extends string = string> {
  id: Id;
  title: string;
  /** The file format tag (`CSV`, `JSON`, `DB`); left out for an item that reads a file in. */
  format?: string;
  /** Lucide icon of the menu row (a spreadsheet when left out). */
  icon?: LucideIcon;
  /** Draws a rule above this row. */
  separatorBefore?: boolean;
}

interface ExportKeyProps<Id extends string> {
  label: string;
  /** The key's icon (a file with a down arrow when left out). */
  icon?: LucideIcon;
  /** One item: the key saves it directly and shows its format tag. Several: the key opens a menu. */
  items: readonly ExportKeyItem<Id>[];
  onSelect: (id: Id) => void;
  /** A save is under way: the key reports busy and ignores presses, without looking disabled. */
  busy?: boolean;
  disabled?: boolean;
  /**
   * One-item key only: the reason it cannot act now (成就's 暂无里程碑). The key stays focusable but
   * `aria-disabled` and dimmed, ignores presses and shows this in the tooltip bubble.
   */
  unavailable?: string;
}

/** The page header's export key: a one-format key, or a key with a caret that opens a glass menu. */
export function ExportKey<Id extends string>({
  label,
  icon: Icon = FileDown,
  items,
  onSelect,
  busy = false,
  disabled = false,
  unavailable,
}: ExportKeyProps<Id>) {
  const { open, setOpen, toggle, closeToTrigger, rootRef, triggerRef } = usePopover();
  const snap = usePixelSnap(open, rootRef, "end");
  const menuRef = useRef<HTMLDivElement>(null);
  // Opening from the keyboard with ArrowUp lands on the last row; every other way on the first.
  const focusLastRef = useRef(false);

  useEffect(() => {
    if (!open) return;
    const rows = menuRows(menuRef.current);
    (focusLastRef.current ? rows[rows.length - 1] : rows[0])?.focus();
    focusLastRef.current = false;
  }, [open]);

  if (items.length === 1) {
    const [only] = items;
    const key = (
      <button
        type="button"
        className="hk hk-solo hk-export"
        aria-label={only.format ? `${label} ${only.format}` : label}
        aria-busy={busy || undefined}
        disabled={disabled}
        onClick={() => {
          if (!busy) onSelect(only.id);
        }}
      >
        <Icon size={16} aria-hidden="true" />
        <span>{label}</span>
        {only.format ? (
          <em className="hk-tag" aria-hidden="true">
            {only.format}
          </em>
        ) : null}
      </button>
    );
    return unavailable ? <UnavailableTooltip message={unavailable}>{key}</UnavailableTooltip> : key;
  }

  const onTriggerKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (busy || (event.key !== "ArrowDown" && event.key !== "ArrowUp")) return;
    event.preventDefault();
    focusLastRef.current = event.key === "ArrowUp";
    setOpen(true);
  };

  const onMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const rows = menuRows(menuRef.current);
    const index = rows.indexOf(document.activeElement as HTMLButtonElement);
    const move = (to: number) => {
      event.preventDefault();
      rows[(to + rows.length) % rows.length]?.focus();
    };
    if (event.key === "ArrowDown") move(index + 1);
    else if (event.key === "ArrowUp") move(index - 1);
    else if (event.key === "Home") move(0);
    else if (event.key === "End") move(rows.length - 1);
    else if (event.key === "Tab") setOpen(false);
  };

  return (
    <div className="hk-wrap" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className="hk hk-solo hk-export"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-busy={busy || undefined}
        disabled={disabled}
        onClick={() => {
          if (!busy) toggle();
        }}
        onKeyDown={onTriggerKeyDown}
      >
        <Icon size={16} aria-hidden="true" />
        <span>{label}</span>
        <ChevronDown size={14} className="hk-caret" aria-hidden="true" />
      </button>
      {open ? (
        <div className="glass-pop hk-menu" role="menu" aria-label={label} ref={menuRef} style={snap} onKeyDown={onMenuKeyDown}>
          {items.map((item) => {
            const RowIcon = item.icon ?? FileSpreadsheet;
            return [
              item.separatorBefore ? <div key={`${item.id}-rule`} className="hk-menu-rule" role="separator" /> : null,
              <button
                key={item.id}
                type="button"
                role="menuitem"
                className="hk-menu-item"
                tabIndex={-1}
                onClick={() => {
                  closeToTrigger();
                  onSelect(item.id);
                }}
              >
                <RowIcon size={16} aria-hidden="true" />
                <span>{item.title}</span>
                {item.format ? <em className="hk-tag">{item.format}</em> : null}
              </button>,
            ];
          })}
        </div>
      ) : null}
    </div>
  );
}

function menuRows(menu: HTMLElement | null): HTMLButtonElement[] {
  return Array.from(menu?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? []);
}
