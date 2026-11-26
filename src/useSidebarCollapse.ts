import { useCallback, useEffect, useState } from "react";

/**
 * The sidebar's 收起 / 展开 state (Apple HIG: let people hide the sidebar, and hide it when the window gets
 * narrow). The choice made in a wide window is remembered on this computer. Below 1200 CSS px (the minimum
 * window, or 文字大小 大) the sidebar folds into its icon rail by itself; opening it there lasts until the
 * window crosses that width again and is not remembered.
 */
export const SIDEBAR_STORAGE_KEY = "gst.sidebar-collapsed";
export const SIDEBAR_NARROW_QUERY = "(max-width: 1199.98px)";

function readStored(): boolean {
  try {
    return window.localStorage.getItem(SIDEBAR_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function writeStored(collapsed: boolean) {
  try {
    if (collapsed) window.localStorage.setItem(SIDEBAR_STORAGE_KEY, "1");
    else window.localStorage.removeItem(SIDEBAR_STORAGE_KEY);
  } catch {
    // Storage can be unavailable; the choice then lasts for this run only.
  }
}

function narrowQuery(): MediaQueryList | null {
  return typeof window.matchMedia === "function" ? window.matchMedia(SIDEBAR_NARROW_QUERY) : null;
}

export function useSidebarCollapse(): { collapsed: boolean; toggle: () => void } {
  const [stored, setStored] = useState(readStored);
  const [narrow, setNarrow] = useState(() => narrowQuery()?.matches ?? false);
  // A choice made while narrow; cleared whenever the window crosses the narrow width.
  const [override, setOverride] = useState<boolean | null>(null);

  useEffect(() => {
    const query = narrowQuery();
    if (!query) return undefined;
    const onChange = () => {
      setNarrow(query.matches);
      setOverride(null);
    };
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  const collapsed = override ?? (narrow || stored);

  const toggle = useCallback(() => {
    const next = !collapsed;
    if (narrow) {
      setOverride(next);
      return;
    }
    setOverride(null);
    setStored(next);
    writeStored(next);
  }, [collapsed, narrow]);

  return { collapsed, toggle };
}
