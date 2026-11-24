import { useCallback, useEffect, useRef, useState } from "react";
import { getMilestoneSoftware, type MilestoneSoftware } from "./api";
import { startVisiblePolling } from "./visiblePolling";

/** Milestones barely move; read as the 成就 page does: on open, on a switch change and when the window returns. */
const REFRESH_INTERVAL_MS = 5 * 60_000;

export interface MilestoneSoftwareState {
  /** The list for the current switch setting; null while it loads, or after the first read failed. */
  software: MilestoneSoftware[] | null;
  /** The last read failed (an earlier list, if any, is kept). */
  failed: boolean;
  /** Reads the list again now; resolves to it, or null when the read fails. */
  reload: () => Promise<MilestoneSoftware[] | null>;
}

/**
 * The software behind the 成就 page's 导出成就 key (spec v0.4.3 C): those with a reached focus milestone,
 * for the page's 包含隐藏软件 switch. `includeHidden` null (the page is not shown) reads nothing.
 */
export function useMilestoneSoftware(includeHidden: boolean | null): MilestoneSoftwareState {
  const [loaded, setLoaded] = useState<{ includeHidden: boolean; software: MilestoneSoftware[] } | null>(null);
  const [failed, setFailed] = useState(false);
  const requestRef = useRef(0);
  const scopeRef = useRef(includeHidden);
  scopeRef.current = includeHidden;

  const reload = useCallback(async () => {
    const scope = scopeRef.current;
    if (scope === null) return null;
    const request = ++requestRef.current;
    try {
      const software = await getMilestoneSoftware(scope);
      // An answer for an earlier switch setting, or after the page closed, is dropped.
      if (request !== requestRef.current || scopeRef.current !== scope) return null;
      setLoaded({ includeHidden: scope, software });
      setFailed(false);
      return software;
    } catch {
      if (request === requestRef.current) setFailed(true);
      return null;
    }
  }, []);

  useEffect(() => {
    setFailed(false);
    if (includeHidden === null) {
      requestRef.current += 1;
      return undefined;
    }
    return startVisiblePolling(reload, REFRESH_INTERVAL_MS);
  }, [includeHidden, reload]);

  const software = loaded !== null && loaded.includeHidden === includeHidden ? loaded.software : null;
  return { software, failed, reload };
}
