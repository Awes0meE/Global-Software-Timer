import { describe, expect, it } from "vitest";
import indexHtml from "../../index.html?raw";
import { allCss, allRules } from "./support/css";

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

describe("bundled font preloads", () => {
  it("preloads every font file the app stylesheet declares", () => {
    const declared = Array.from(
      allCss()["styles.css"].matchAll(/url\("\.\/(assets\/fonts\/[^"]+\.woff2)"\)/g),
      (match) => `/src/${match[1]}`,
    );
    const preloaded = Array.from(
      parseHead().querySelectorAll<HTMLLinkElement>('link[rel="preload"][as="font"]'),
      (link) => link.getAttribute("href"),
    );

    expect(declared).toContain("/src/assets/fonts/oxanium/Oxanium-Variable.woff2");
    expect(preloaded.sort()).toEqual(declared.sort());
  });
});

describe("GST Num sizing", () => {
  // Oxanium's digits are 0.69 em tall, Inter's 0.747 em: 108% puts the numbers back at Inter's height.
  it("scales the number font to Inter's digit height", () => {
    const face = allCss()["styles.css"].match(/@font-face\s*\{[^}]*font-family:\s*"GST Num"[^}]*\}/)?.[0];

    expect(face).toBeDefined();
    expect(face).toMatch(/size-adjust:\s*108%;/);
  });

  it("spaces numbers a hairline away from the Chinese units after them", () => {
    const spaced = allRules()
      .filter((rule) => rule.declarations["text-autospace"] === "normal")
      .flatMap((rule) => rule.selectors);

    expect(spaced).toEqual(expect.arrayContaining([".num", ".background-table td", ".recorder-svg .vals"]));
  });
});
