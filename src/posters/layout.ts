// Poster layout pass, ported from the approved round-3 mockups (kit.js). Posters are laid out at
// 540×720 CSS px; every coordinate below is in that space, whatever transform the poster is shown with.
//
// Elements opt in through data attributes (set by the components in PosterParts.tsx):
//   .poster-abs     data-x (left) | data-right (right edge) | data-cx (centre x)
//                   data-y (top) | data-bl (baseline y) | data-cy (centre y) | data-captop (hero figure top)
//   data-fs         the element's base font size in px; every pass starts from it, so the pass is idempotent
//   data-fit="W"    shrink the element (children sized in em) to at most W px wide
//   data-maxw="W"   names: shrink to 0.8×, then (data-lines="2") two balanced lines at 0.8×, then ellipsis

export const POSTER_WIDTH = 540;
export const POSTER_HEIGHT = 720;

/** Names never shrink below this share of their size before wrapping or ellipsis. */
export const NAME_MIN_SCALE = 0.8;

/** Inter's figures are cap height: 1490 of 2048 units per em. */
export const INTER_CAP_HEIGHT = 1490 / 2048;

export type NameFitMode = "fits" | "shrink" | "two-lines" | "ellipsis";

export interface NameFit {
  mode: NameFitMode;
  /** Font-size factor to apply. */
  scale: number;
}

/**
 * How a name of `width` px (at its base size) fits a `max` px slot: as is; shrunk (down to 0.8×);
 * else, when two lines are allowed, wrapped to two balanced lines at 0.8×; else ellipsis at 0.8×.
 */
export function fitName(width: number, max: number, allowTwoLines: boolean): NameFit {
  if (width <= max) {
    return { mode: "fits", scale: 1 };
  }
  const scale = Math.max(NAME_MIN_SCALE, max / width);
  if (width * scale <= max + 0.01) {
    return { mode: "shrink", scale };
  }
  return { mode: allowTwoLines ? "two-lines" : "ellipsis", scale };
}

/** Font size that makes a group `width` px wide at `size` fit `slot` px (never grows). */
export function fitToWidth(size: number, width: number, slot: number): number {
  return width > slot ? size * (slot / width) : size;
}

/** PNG pixels per poster CSS px. */
export const OUTPUT_SCALE = 2;

/** Inter's `opsz` for text of `cssSize` px on the poster: its size in the PNG, within the axis (14–32). */
export function opticalSize(cssSize: number): number {
  return Math.round(Math.min(32, Math.max(14, cssSize * OUTPUT_SCALE)) * 100) / 100;
}

/** Baseline y that puts the hero's figure tops at `capTop`, for a hero font size in px. */
export function capTopBaseline(capTop: number, heroFontSize: number): number {
  return capTop + INTER_CAP_HEIGHT * heroFontSize;
}

const NAME_STYLE_KEYS = [
  "display",
  "webkitBoxOrient",
  "webkitLineClamp",
  "overflow",
  "whiteSpace",
  "textWrap",
  "lineHeight",
  "width",
  "maxWidth",
  "textOverflow",
  "verticalAlign",
] as const;

function num(value: string | undefined): number | undefined {
  if (value === undefined || value === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function setStyle(el: HTMLElement, key: (typeof NAME_STYLE_KEYS)[number], value: string) {
  (el.style as unknown as Record<string, string>)[key] = value;
}

/** Runs the whole pass on one poster root (`.gst-poster`). Safe to call again at any time. */
export function layoutPoster(poster: HTMLElement): void {
  // Measurements are taken in poster space: the dialog shows the poster scaled down.
  const rootRect = poster.getBoundingClientRect();
  const k = rootRect.width > 0 ? rootRect.width / POSTER_WIDTH : 1;
  const width = (el: Element) => el.getBoundingClientRect().width / k;

  // 0. Reset everything a previous pass changed.
  for (const el of poster.querySelectorAll<HTMLElement>("[data-fs]")) {
    el.style.fontSize = `${el.dataset.fs}px`;
  }
  for (const el of poster.querySelectorAll<HTMLElement>("[data-maxw]")) {
    for (const key of NAME_STYLE_KEYS) setStyle(el, key, "");
    const parent = el.parentElement;
    if (parent) {
      parent.style.whiteSpace = "";
      parent.style.lineHeight = "";
    }
  }

  // 1. Names.
  for (const el of poster.querySelectorAll<HTMLElement>("[data-maxw]")) {
    const max = Number(el.dataset.maxw);
    const base = parseFloat(getComputedStyle(el).fontSize);
    const fit = fitName(width(el), max, el.dataset.lines === "2");
    if (fit.mode === "fits") continue;
    el.style.fontSize = `${base * fit.scale}px`;
    if (fit.mode === "two-lines") {
      setStyle(el, "display", "-webkit-box");
      setStyle(el, "webkitBoxOrient", "vertical");
      setStyle(el, "webkitLineClamp", "2");
      setStyle(el, "overflow", "hidden");
      setStyle(el, "whiteSpace", "normal");
      setStyle(el, "textWrap", "balance");
      setStyle(el, "lineHeight", "1.15");
      setStyle(el, "width", `${max}px`);
      const parent = el.parentElement;
      if (parent) {
        parent.style.whiteSpace = "normal";
        parent.style.lineHeight = "1.15";
      }
    } else if (fit.mode === "ellipsis") {
      setStyle(el, "display", "inline-block");
      setStyle(el, "maxWidth", `${max}px`);
      setStyle(el, "overflow", "hidden");
      setStyle(el, "textOverflow", "ellipsis");
      setStyle(el, "verticalAlign", "top");
    }
  }

  // 2. Groups fitted to a width (hero + em-sized unit scale together, keeping the unit ratio).
  for (const el of poster.querySelectorAll<HTMLElement>("[data-fit]")) {
    const size = parseFloat(getComputedStyle(el).fontSize);
    el.style.fontSize = `${fitToWidth(size, width(el), Number(el.dataset.fit))}px`;
  }

  // 3. Inter's optical size follows the size the text has in the PNG (2× its CSS px), as in the mockups,
  //    which were drawn at PNG size. The hero keeps its own fixed display size (posters.css).
  for (const el of poster.querySelectorAll<HTMLElement>("[data-fs]")) {
    el.style.fontVariationSettings = `"opsz" ${opticalSize(parseFloat(getComputedStyle(el).fontSize))}`;
  }

  // 4. Position.
  for (const el of poster.querySelectorAll<HTMLElement>(".poster-abs")) {
    const d = el.dataset;
    el.style.left = "0px";
    el.style.top = "0px";
    const rect = el.getBoundingClientRect();
    const w = rect.width / k;
    const h = rect.height / k;

    const x = num(d.x);
    const right = num(d.right);
    const cx = num(d.cx);
    if (x !== undefined) el.style.left = `${x}px`;
    else if (right !== undefined) el.style.left = `${right - w}px`;
    else if (cx !== undefined) el.style.left = `${cx - w / 2}px`;

    let baseline = num(d.bl);
    const capTop = num(d.captop);
    if (capTop !== undefined) {
      const hero = el.querySelector<HTMLElement>(".poster-hero") ?? el;
      baseline = capTopBaseline(capTop, parseFloat(getComputedStyle(hero).fontSize));
    }

    const y = num(d.y);
    const cy = num(d.cy);
    if (y !== undefined) el.style.top = `${y}px`;
    else if (cy !== undefined) el.style.top = `${cy - h / 2}px`;
    else if (baseline !== undefined) {
      const marker = document.createElement("span");
      marker.style.cssText = "display:inline-block;width:0;height:0;vertical-align:baseline";
      el.appendChild(marker);
      const offset = (marker.getBoundingClientRect().top - el.getBoundingClientRect().top) / k;
      el.removeChild(marker);
      el.style.top = `${baseline - offset}px`;
    }
  }
}
