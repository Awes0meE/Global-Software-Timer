// Poster-only fonts (spec v0.4.3 H): bundled by Vite as local assets, registered and fetched only when a
// poster is shown or rendered. The app UI never uses these family names.
import interUrl from "../assets/fonts/poster/InterVariable-latin.woff2?url";
import notoUrl from "../assets/fonts/poster/NotoSansSC-VF-gb2312.woff2?url";

export const POSTER_INTER = "GST Poster Inter";
export const POSTER_NOTO = "GST Poster Noto SC";

interface PosterFont {
  family: string;
  url: string;
}

const FONTS: readonly PosterFont[] = [
  { family: POSTER_INTER, url: interUrl },
  { family: POSTER_NOTO, url: notoUrl },
];

/** Weights the posters use; both fonts are variable, so this only primes `document.fonts.load`. */
const WEIGHTS = [300, 400, 500, 600] as const;

/** Text that touches every glyph run the posters draw before their content is known. */
const SAMPLE = "0123456789.小时今日当日活跃记录成就专注里程碑使用天累计全局软件计时器年月日周一二三四五六AaBb";

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => (typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("font")));
    reader.onerror = () => reject(reader.error ?? new Error("font"));
    reader.readAsDataURL(blob);
  });
}

async function fontDataUrl(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error("poster_font_unavailable");
  }
  const blob = await response.blob();
  return blobToDataUrl(new Blob([blob], { type: "font/woff2" }));
}

let embedCss: Promise<string> | null = null;

/**
 * `@font-face` rules for modern-screenshot's `font.cssText`, with the fonts inlined as data: URLs: the
 * capture is an SVG image, which cannot load any other URL, so this is what embeds the fonts in the PNG.
 */
export function posterFontEmbedCss(): Promise<string> {
  embedCss ??= Promise.all(
    FONTS.map(
      async ({ family, url }) =>
        `@font-face{font-family:"${family}";src:url("${await fontDataUrl(url)}") format("woff2");font-weight:100 900;font-style:normal;font-display:block;}`,
    ),
  )
    .then((rules) => rules.join("\n"))
    .catch((error: unknown) => {
      embedCss = null;
      throw error;
    });
  return embedCss;
}

let loading: Promise<void> | null = null;

/**
 * Registers the poster faces with `document.fonts` (once) and waits until both are loaded.
 * Resolves even where the FontFace API is missing (tests) or a face fails: the poster then falls back
 * to "Microsoft YaHei UI", and the caller still gets a picture.
 */
export function loadPosterFonts(): Promise<void> {
  loading ??= loadAll();
  return loading;
}

async function loadAll(): Promise<void> {
  if (typeof document === "undefined" || !document.fonts || typeof FontFace === "undefined") {
    return;
  }

  await Promise.all(
    FONTS.map(async ({ family, url }) => {
      const face = new FontFace(family, `url("${url}") format("woff2")`, {
        weight: "100 900",
        style: "normal",
        display: "block",
      });
      document.fonts.add(face);
      try {
        await face.load();
      } catch {
        // Fallback fonts take over; nothing else to do.
      }
    }),
  );

  await Promise.all(
    FONTS.flatMap(({ family }) =>
      WEIGHTS.map((weight) => document.fonts.load(`${weight} 40px "${family}"`, SAMPLE).catch(() => [])),
    ),
  );
}
