// Poster capture (spec v0.4.3 F): modern-screenshot is imported only here, on demand, so it stays out
// of the startup bundle.
import { loadPosterFonts, posterFontEmbedCss } from "./fonts";
import { layoutPoster, OUTPUT_SCALE, POSTER_HEIGHT, POSTER_WIDTH } from "./layout";

/** Integer capture scale: 540×720 CSS px -> 1080×1440 PNG. Never devicePixelRatio. */
export const POSTER_SCALE = OUTPUT_SCALE;

/** The poster's opaque base colour per theme, used when `--p-base` cannot be read (a test asserts posters.css agrees). */
export const POSTER_BASE_COLORS = { dark: "#121218", light: "#f3f3f8" } as const;

/** Longest wait for one animation frame: WebView2 pauses rAF while the window is minimised or in the tray. */
export const FRAME_TIMEOUT_MS = 100;

/** The next animation frame, or FRAME_TIMEOUT_MS when none comes (hidden window). */
export function nextFrame(): Promise<void> {
  return new Promise((resolve) => {
    let frame = 0;
    const timer = setTimeout(() => {
      cancelAnimationFrame(frame);
      resolve();
    }, FRAME_TIMEOUT_MS);
    frame = requestAnimationFrame(() => {
      clearTimeout(timer);
      resolve();
    });
  });
}

/** The colour the poster paints under its glow (`--p-base`), so the capture background matches it. */
function posterBaseColor(element: HTMLElement): string {
  const painted = getComputedStyle(element).getPropertyValue("--p-base").trim();
  if (painted) return painted;
  return element.classList.contains("is-light") ? POSTER_BASE_COLORS.light : POSTER_BASE_COLORS.dark;
}

function pngSize(bytes: Uint8Array): { width: number; height: number } | null {
  // Signature (8) + IHDR length (4) + "IHDR" (4), then width and height as big-endian u32.
  if (bytes.length < 24) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

/**
 * Renders a mounted poster root (`.gst-poster`, laid out at 540×720 and not `display: none`) to PNG bytes.
 * Waits for the poster fonts, every image's decode and two animation frames before capturing.
 */
export async function renderPosterPng(element: HTMLElement): Promise<Uint8Array> {
  await loadPosterFonts();
  await Promise.all(
    Array.from(element.querySelectorAll("img")).map((img) =>
      typeof img.decode === "function" ? img.decode().catch(() => undefined) : undefined,
    ),
  );
  layoutPoster(element);
  await nextFrame();
  await nextFrame();

  const [{ domToBlob }, fontCss] = await Promise.all([import("modern-screenshot"), posterFontEmbedCss()]);
  const backgroundColor = posterBaseColor(element);
  const blob = await domToBlob(element, {
    width: POSTER_WIDTH,
    height: POSTER_HEIGHT,
    scale: POSTER_SCALE,
    backgroundColor,
    type: "image/png",
    font: { cssText: fontCss },
  });
  const bytes = new Uint8Array(await blob.arrayBuffer());

  const size = pngSize(bytes);
  if (!size || size.width !== POSTER_WIDTH * POSTER_SCALE || size.height !== POSTER_HEIGHT * POSTER_SCALE) {
    throw new Error("poster_render_failed");
  }
  return bytes;
}
