import { useEffect, useRef } from "react";

/**
 * Window-wide keyboard shortcuts (Apple HIG: give common commands a shortcut).
 * Ctrl+1…6 open the sidebar's pages in order (the unavailable 时间轴 has none), Ctrl+, opens 设置 as on the
 * Mac, and Ctrl+← / Ctrl+→ step the day on the pages that show one. Text fields and dialogs keep their keys.
 */
export type ShortcutAction = { kind: "page"; index: number } | { kind: "settings" } | { kind: "day"; delta: -1 | 1 };

const PAGE_KEYS = ["1", "2", "3", "4", "5", "6"];

export function shortcutAction(event: KeyboardEvent): ShortcutAction | null {
  if (event.defaultPrevented || !event.ctrlKey || event.altKey || event.shiftKey || event.metaKey) return null;
  const target = event.target instanceof Element ? event.target : null;
  if (target?.closest('input, textarea, select, [contenteditable="true"], [role="dialog"]')) return null;
  const page = PAGE_KEYS.indexOf(event.key);
  if (page >= 0) return { kind: "page", index: page };
  if (event.key === ",") return { kind: "settings" };
  if (event.key === "ArrowLeft") return { kind: "day", delta: -1 };
  if (event.key === "ArrowRight") return { kind: "day", delta: 1 };
  return null;
}

/** `aria-keyshortcuts` for the n-th available sidebar page (0-based); 设置 also lists Ctrl+,. */
export function pageShortcut(index: number, isSettings: boolean): string | undefined {
  if (index < 0 || index >= PAGE_KEYS.length) return undefined;
  return `Control+${PAGE_KEYS[index]}${isSettings ? " Control+," : ""}`;
}

/** Runs `onAction` for each shortcut while no modal dialog is open; the handler may ignore what does not apply. */
export function useKeyboardShortcuts(onAction: (action: ShortcutAction) => boolean): void {
  const handler = useRef(onAction);
  handler.current = onAction;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      // A modal dialog marks the rest of the app inert; its keys belong to it.
      if (document.querySelector('[aria-modal="true"]')) return;
      const action = shortcutAction(event);
      if (action && handler.current(action)) event.preventDefault();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}
