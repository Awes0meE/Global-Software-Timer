import type { ReactElement } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { renderPosterPng } from "./renderPosterPng";

// Off-screen but laid out: never display: none or visibility: hidden, or the capture measures nothing.
// The one way posters are mounted for capture (spec v0.4.3 F.2): a detached root on <body>, which is what
// a portal would give, without tying the export to the caller's render.
const OFFSCREEN_STYLE = "position:fixed;left:-10000px;top:0;pointer-events:none;";

/**
 * Mounts `poster` (a `DailyPoster` or `AchievementPoster` element, icons already as data: URLs) off
 * screen, renders it to PNG bytes and unmounts it again.
 */
export async function capturePoster(poster: ReactElement): Promise<Uint8Array> {
  const host = document.createElement("div");
  host.setAttribute("aria-hidden", "true");
  host.style.cssText = OFFSCREEN_STYLE;
  document.body.appendChild(host);
  const root = createRoot(host);
  try {
    flushSync(() => root.render(poster));
    const node = host.querySelector<HTMLElement>(".gst-poster");
    if (!node) {
      throw new Error("poster_render_failed");
    }
    return await renderPosterPng(node);
  } finally {
    root.unmount();
    host.remove();
  }
}
