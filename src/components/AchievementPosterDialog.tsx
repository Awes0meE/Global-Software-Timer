import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import type { MilestoneSoftware } from "../api";
import { AchievementPoster, achievementPosterModel, type PosterTheme } from "../posters";
import { SoftwareIcon } from "./SoftwareIcon";
import { useModalDialog } from "./useModalDialog";
import "./AchievementPosterDialog.css";

/** Typed letters within this pause add up to one search (as in the mock and native list boxes). */
export const TYPEAHEAD_RESET_MS = 600;

/** The list order (spec v0.4.3 C.2): tier, then total focus, highest first. Stable for equal rows. */
export function orderMilestoneSoftware(software: readonly MilestoneSoftware[]): MilestoneSoftware[] {
  return [...software].sort(
    (left, right) => right.tier_hours - left.tier_hours || right.total_focused_seconds - left.total_focused_seconds,
  );
}

/** The software whose highest tier was reached most recently; ties go to the one listed first. */
export function defaultMilestoneKey(ordered: readonly MilestoneSoftware[]): string | null {
  let latest: MilestoneSoftware | null = null;
  for (const row of ordered) {
    if (latest === null || row.reached_on > latest.reached_on) latest = row;
  }
  return latest?.identity_key ?? null;
}

interface Props {
  /** Software with a reached focus milestone (as get_milestone_software lists them); never empty. */
  software: readonly MilestoneSoftware[];
  theme: PosterTheme;
  /** A save is under way: 保存图片 reports busy and ignores presses, 取消 and Esc are off. */
  busy: boolean;
  onSave: (software: MilestoneSoftware) => void;
  onCancel: () => void;
}

/**
 * The 成就海报 dialog (spec v0.4.3 C, approved mock picker.html): a live poster preview on the left, the
 * milestone list box on the right, 取消 and 保存图片 below. The list takes focus on open; ↑ ↓ Home End and
 * typing move the selection, Enter or a double-click saves, Esc cancels.
 */
export function AchievementPosterDialog({ software, theme, busy, onSave, onCancel }: Props) {
  const dialogRef = useRef<HTMLElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const titleId = useId();
  const optionPrefix = useId();
  const rows = orderMilestoneSoftware(software);
  const [selectedKey, setSelectedKey] = useState(() => defaultMilestoneKey(rows));
  // A refreshed list keeps the selection while that software is still listed, else falls back to the default.
  const selected = rows.find((row) => row.identity_key === selectedKey) ?? rows.find((row) => row.identity_key === defaultMilestoneKey(rows));
  const typeaheadRef = useRef({ text: "", at: 0 });
  const optionId = (key: string) => `${optionPrefix}-${key}`;

  useModalDialog(dialogRef, { onCancel, busy, initialFocus: listRef });

  useEffect(() => {
    if (selected && selected.identity_key !== selectedKey) setSelectedKey(selected.identity_key);
  }, [selected, selectedKey]);

  // Keep the selected row in view; the list scrolls past about six rows.
  const selectedId = selected ? optionId(selected.identity_key) : undefined;
  useEffect(() => {
    if (selectedId) document.getElementById(selectedId)?.scrollIntoView?.({ block: "nearest" });
  }, [selectedId]);

  const save = () => {
    if (!busy && selected) onSave(selected);
  };

  const onListKeyDown = (event: KeyboardEvent<HTMLUListElement>) => {
    const index = rows.findIndex((row) => row.identity_key === selected?.identity_key);
    const go = (to: number) => {
      event.preventDefault();
      setSelectedKey(rows[Math.max(0, Math.min(rows.length - 1, to))].identity_key);
    };
    if (event.key === "ArrowDown") go(index + 1);
    else if (event.key === "ArrowUp") go(index - 1);
    else if (event.key === "Home") go(0);
    else if (event.key === "End") go(rows.length - 1);
    else if (event.key === "Enter") {
      event.preventDefault();
      save();
    } else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      // Typeahead: one letter (or the same letter again and again) looks from the next row on, so it
      // cycles through the names starting with it; a longer search looks from the current row. Both wrap.
      const now = Date.now();
      const typed = (now - typeaheadRef.current.at > TYPEAHEAD_RESET_MS ? "" : typeaheadRef.current.text) + event.key.toLowerCase();
      typeaheadRef.current = { text: typed, at: now };
      const chars = Array.from(typed);
      const search = chars.every((char) => char === chars[0]) ? chars[0] : typed;
      const from = index + (search.length === 1 ? 1 : 0);
      const hit = [...rows.slice(from), ...rows.slice(0, from)].find((row) => row.display_name.toLowerCase().startsWith(search));
      if (event.key === " " || hit) event.preventDefault();
      if (hit) setSelectedKey(hit.identity_key);
    }
  };

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        // A press on the scrim keeps focus where it is, inside the dialog.
        if (event.target === event.currentTarget) event.preventDefault();
      }}
    >
      <section
        ref={dialogRef}
        className="dialog poster-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-busy={busy || undefined}
        tabIndex={-1}
      >
        <h2 id={titleId}>成就海报</h2>
        <div className="poster-dialog-body">
          <div className="poster-thumb">
            {selected ? (
              <div className="poster-thumb-scale">
                <AchievementPoster model={achievementPosterModel(selected)} theme={theme} />
              </div>
            ) : null}
          </div>
          <div className="poster-list-box">
            <ul
              ref={listRef}
              className="poster-list"
              role="listbox"
              aria-labelledby={titleId}
              aria-activedescendant={selectedId}
              tabIndex={0}
              onKeyDown={onListKeyDown}
            >
              {rows.map((row) => {
                const isSelected = row.identity_key === selected?.identity_key;
                return (
                  <li
                    key={row.identity_key}
                    id={optionId(row.identity_key)}
                    className={`poster-row${isSelected ? " is-selected" : ""}`}
                    role="option"
                    aria-selected={isSelected}
                    aria-label={`${row.display_name} ${row.tier_hours} 小时`}
                    onClick={() => setSelectedKey(row.identity_key)}
                    onDoubleClick={() => {
                      setSelectedKey(row.identity_key);
                      if (!busy) onSave(row);
                    }}
                  >
                    <SoftwareIcon app={row} size="md" />
                    <span className="poster-row-name">{row.display_name}</span>
                    <span className="poster-row-tier">
                      <b className="num">{row.tier_hours}</b>
                      <small>小时</small>
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
        <div className="dialog-actions">
          <button type="button" className="button button-secondary" disabled={busy} onClick={onCancel}>
            取消
          </button>
          <button
            type="button"
            className="button button-primary"
            aria-busy={busy || undefined}
            onClick={save}
          >
            保存图片
          </button>
        </div>
      </section>
    </div>
  );
}
