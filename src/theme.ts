import { getCurrentWindow } from "@tauri-apps/api/window";
import { normalizeThemePreference, type ThemePreference } from "./api";

export type ResolvedTheme = "light" | "dark";

const cacheKey = "gst.theme";
const darkQuery = "(prefers-color-scheme: dark)";

export function resolveTheme(preference: ThemePreference, systemPrefersDark: boolean): ResolvedTheme {
  if (preference === "system") {
    return systemPrefersDark ? "dark" : "light";
  }

  return preference;
}

/** Last saved preference, used only to paint the first frame before settings load. */
export function readCachedThemePreference(): ThemePreference {
  try {
    return normalizeThemePreference(window.localStorage.getItem(cacheKey));
  } catch {
    return "system";
  }
}

function cacheThemePreference(preference: ThemePreference) {
  try {
    window.localStorage.setItem(cacheKey, preference);
  } catch {
    // The SQLite setting stays the source of truth; the cache only avoids a flash.
  }
}

function systemPrefersDark(): boolean {
  return typeof window.matchMedia === "function" && window.matchMedia(darkQuery).matches;
}

function paint(theme: ResolvedTheme) {
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.style.colorScheme = theme;
}

/**
 * Applies a theme preference to the document and the native window frame.
 * Returns a cleanup that stops following the system theme.
 */
export function applyThemePreference(preference: ThemePreference): () => void {
  cacheThemePreference(preference);
  paint(resolveTheme(preference, systemPrefersDark()));

  try {
    void getCurrentWindow()
      .setTheme(preference === "system" ? null : preference)
      .catch(() => {});
  } catch {
    // Outside Tauri (tests, browser preview) there is no native frame to theme.
  }

  if (preference !== "system" || typeof window.matchMedia !== "function") {
    return () => {};
  }

  const media = window.matchMedia(darkQuery);
  const handleChange = (event: MediaQueryListEvent) => paint(event.matches ? "dark" : "light");
  media.addEventListener("change", handleChange);

  return () => media.removeEventListener("change", handleChange);
}

/** Paints the cached theme synchronously before React renders. */
export function paintInitialTheme() {
  paint(resolveTheme(readCachedThemePreference(), systemPrefersDark()));
}

/** The theme painted now (`data-theme` on <html>), e.g. for posters, which follow the app. */
export function paintedTheme(): ResolvedTheme {
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}
