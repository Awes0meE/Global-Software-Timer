// 启动时打开 (spec §E): the first render opens the cached start page, so a start on another page never
// flips from 概览. SQLite (`ui.start_page`) stays the source of truth; App refreshes this cache from it.
import { normalizeStartPage, type StartPage } from "./api";

const cacheKey = "gst.startPage";

export function readCachedStartPage(): StartPage {
  try {
    return normalizeStartPage(window.localStorage.getItem(cacheKey));
  } catch {
    return "overview";
  }
}

export function cacheStartPage(page: StartPage): void {
  try {
    window.localStorage.setItem(cacheKey, page);
  } catch {
    // Storage may be blocked; the next start reconciles from SQLite.
  }
}
