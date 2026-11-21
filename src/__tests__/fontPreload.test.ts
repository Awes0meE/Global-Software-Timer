import { describe, expect, it } from "vitest";
import indexHtml from "../../index.html?raw";

// N16: the LCD pixel font uses font-display: swap, so it must be preloaded from
// index.html (fetched in parallel with the JS bundle) to avoid a visible
// Microsoft YaHei -> pixel font flash on first paint. Vite rewrites the href to
// the emitted hashed asset at build time, so the href must point at the source
// file that the @font-face rule in src/styles.css uses.
const FONT_FILE = "ark-pixel-12px-zh_hans.woff2";

function parseHead() {
  return new DOMParser().parseFromString(indexHtml, "text/html").head;
}

describe("GST Pixel font preload", () => {
  it("preloads the bundled pixel font from index.html", () => {
    const preload = parseHead().querySelector<HTMLLinkElement>('link[rel="preload"][as="font"]');

    expect(preload).not.toBeNull();
    expect(preload?.getAttribute("href")).toBe(`/src/assets/fonts/${FONT_FILE}`);
    expect(preload?.getAttribute("type")).toBe("font/woff2");
    // Fonts are fetched in CORS mode; without crossorigin the preload is not reused.
    expect(preload?.hasAttribute("crossorigin")).toBe(true);
  });
});
