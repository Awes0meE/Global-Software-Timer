// v0.4.4 主题色, 墨水屏配色 and 减少动画 on the document (spec §B, §C, §F, §I). CSS stays theme-driven: this
// only sets data-accent / data-eink / data-motion and the inline --user-accent-* pair on <html>.
import { isHexColour, resolveAccent, type AccentPair } from "./accent";
import {
  getWindowsAccent,
  normalizeAccent,
  normalizeEink,
  normalizeReduceMotion,
  type AccentId,
  type EinkId,
  type ReduceMotion,
} from "./api";

export interface Appearance {
  accent: AccentId;
  /**
   * The last known Windows pair, or null when it cannot be read: raw from Windows after a read, or the
   * cached, already clamped pair after a restart. Painting clamps it either way; the clamp leaves a
   * colour it produced unchanged.
   */
  windowsAccent: AccentPair | null;
  eink: EinkId;
  motion: ReduceMotion;
}

/** An appearance to apply; without `windowsAccent`, the last known Windows pair is kept. */
export type AppearanceUpdate = Omit<Appearance, "windowsAccent"> & { windowsAccent?: AccentPair | null };

export const defaultAppearance: Appearance = { accent: "blue", windowsAccent: null, eink: "aurora", motion: "system" };

const cacheKey = "gst.appearance";

let current: Appearance = { ...defaultAppearance };
/** Told after every commit, e.g. so the 跟随 Windows swatch shows a pair the watch has just read. */
const listeners = new Set<() => void>();
/** Set while a watch runs: asks it to read the Windows accent now. */
let requestWindowsRead: (() => void) | null = null;
/** Each Windows read gets a number; a slower, older read never overwrites a newer one. */
let latestWindowsRead = 0;

function validPair(value: unknown): AccentPair | null {
  if (typeof value !== "object" || value === null) return null;
  const { light, dark } = value as Record<string, unknown>;
  return isHexColour(light) && isHexColour(dark) ? { light: light.toLowerCase(), dark: dark.toLowerCase() } : null;
}

function paint(appearance: Appearance) {
  const root = document.documentElement;
  if (appearance.accent === "blue") {
    delete root.dataset.accent;
    root.style.removeProperty("--user-accent-light");
    root.style.removeProperty("--user-accent-dark");
  } else {
    const pair = resolveAccent(appearance.accent, appearance.windowsAccent);
    root.dataset.accent = appearance.accent;
    root.style.setProperty("--user-accent-light", pair.light);
    root.style.setProperty("--user-accent-dark", pair.dark);
  }
  if (appearance.eink === "aurora") {
    delete root.dataset.eink;
  } else {
    root.dataset.eink = appearance.eink;
  }
  if (appearance.motion === "reduce") {
    root.dataset.motion = "reduced";
  } else {
    delete root.dataset.motion;
  }
}

/**
 * Writes the first-frame cache: the choices, and the Windows pair as resolved by the clamp (`#rrggbb` only).
 * SQLite stays the source of truth; the cache only avoids a flash before settings load.
 */
export function cacheAppearance(appearance: Appearance): void {
  const windows = appearance.windowsAccent ? resolveAccent("system", appearance.windowsAccent) : null;
  try {
    window.localStorage.setItem(
      cacheKey,
      JSON.stringify({ accent: appearance.accent, windows, eink: appearance.eink, motion: appearance.motion }),
    );
  } catch {
    // Storage may be blocked; the next load paints from SQLite.
  }
}

/** The cached appearance, validated field by field; today's look where anything is missing or invalid. */
export function readCachedAppearance(): Appearance {
  let raw: unknown = null;
  try {
    raw = JSON.parse(window.localStorage.getItem(cacheKey) ?? "null");
  } catch {
    raw = null;
  }
  const entry = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  return {
    accent: normalizeAccent(entry.accent),
    windowsAccent: validPair(entry.windows),
    eink: normalizeEink(entry.eink),
    motion: normalizeReduceMotion(entry.motion),
  };
}

function commit(appearance: Appearance) {
  current = appearance;
  paint(appearance);
  cacheAppearance(appearance);
  for (const listener of listeners) listener();
}

/** The appearance painted now; a new object after every change (for `useSyncExternalStore`). */
export function currentAppearance(): Appearance {
  return current;
}

/** Calls `listener` after every applied change; returns the unsubscribe. */
export function subscribeAppearance(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Applies an appearance to <html> and caches it. With 跟随 Windows, a running `startAccentWatch` reads the
 * Windows accent again.
 */
export function applyAppearance(update: AppearanceUpdate): void {
  commit({ ...update, windowsAccent: update.windowsAccent === undefined ? current.windowsAccent : update.windowsAccent });
  if (current.accent === "system") requestWindowsRead?.();
}

/** Paints the cached appearance synchronously before React renders. */
export function paintInitialAppearance(): void {
  current = readCachedAppearance();
  paint(current);
}

/** Reads the Windows accent once. A malformed answer counts as unreadable (蓝); a failed read keeps the last pair. */
function readWindowsAccent(read: () => Promise<unknown>) {
  const request = ++latestWindowsRead;
  let pending: Promise<unknown>;
  try {
    pending = Promise.resolve(read());
  } catch {
    return;
  }
  pending.then(
    (value) => {
      if (request === latestWindowsRead) commit({ ...current, windowsAccent: validPair(value) });
    },
    () => {},
  );
}

/**
 * Reads the Windows accent once so the 跟随 Windows swatch on 设置 shows it while another accent is chosen
 * (spec §A). Painting a preset ignores the pair, so nothing on screen but the swatch changes; with 跟随
 * Windows, `startAccentWatch` already reads (§B).
 */
export function readWindowsAccentForSwatch(read: () => Promise<unknown> = getWindowsAccent): void {
  if (current.accent !== "system") readWindowsAccent(read);
}

/**
 * Reads the Windows accent now and whenever the window becomes visible again, only while the choice is
 * 跟随 Windows. A malformed answer counts as unreadable (蓝); a failed read keeps the last pair. Returns a
 * cleanup that stops listening.
 */
export function startAccentWatch(read: () => Promise<unknown> = getWindowsAccent): () => void {
  const check = () => {
    if (document.hidden || current.accent !== "system") return;
    readWindowsAccent(read);
  };

  document.addEventListener("visibilitychange", check);
  requestWindowsRead = check;
  check();
  return () => {
    latestWindowsRead += 1;
    document.removeEventListener("visibilitychange", check);
    if (requestWindowsRead === check) requestWindowsRead = null;
  };
}
