// Poster layout pass, ported from the approved round-3 mockups (kit.js). Posters are laid out at
// 540×720 CSS px; every coordinate below is in that space, whatever transform the poster is shown with.
//
// Elements opt in through data attributes (set by the components in PosterParts.tsx):
//   .poster-abs     data-x (left) | data-right (right edge) | data-cx (centre x)
//                   data-y (top) | data-bl (baseline y) | data-cy (centre y) | data-captop (hero figure top)
//   data-fs         the element's base font size in px; every pass starts again from it and from Inter's
//                   optical size for it, so repeated passes (and passes under any transform) agree
//   data-fit="W"    shrink the element (children sized in em) to at most W px wide
//   data-maxw="W"   names: shrink to 0.8×, then (data-lines="2") two balanced lines at 0.8×, then ellipsis;
//   data-text       the full name, restored on every pass (the ellipsis is written into the text itself,
//                   because the capture's clone does not keep -webkit-line-clamp or text-overflow)

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

/** Width tolerance in px for "fits", against sub-pixel measuring noise. */
const FIT_EPSILON = 0.01;

/** Shrink attempts before giving up on one line (Inter widens slightly as its optical size drops). */
const SHRINK_STEPS = 6;

/**
 * How a name fits a `max` px slot. `measure(scale)` is the name's width in px at `scale` × its base size,
 * measured with the optical size that size renders with (so each trial size is measured, never
 * extrapolated). As is; else shrunk (down to 0.8×); else, when two lines are allowed, two balanced lines
 * at 0.8×; else ellipsis at 0.8×.
 */
export function fitName(measure: (scale: number) => number, max: number, allowTwoLines: boolean): NameFit {
  let width = measure(1);
  if (width <= max + FIT_EPSILON) {
    return { mode: "fits", scale: 1 };
  }
  let scale = 1;
  for (let step = 0; step < SHRINK_STEPS && scale > NAME_MIN_SCALE; step += 1) {
    scale = Math.max(NAME_MIN_SCALE, scale * (max / width));
    width = measure(scale);
    if (width <= max + FIT_EPSILON) {
      return { mode: "shrink", scale };
    }
  }
  return { mode: allowTwoLines ? "two-lines" : "ellipsis", scale: NAME_MIN_SCALE };
}

/**
 * The longest prefix of `text` (whole characters, trailing spaces dropped) plus "…" for which `fits` is true,
 * or `text` itself when it already fits.
 */
export function ellipsize(text: string, fits: (candidate: string) => boolean): string {
  if (fits(text)) return text;
  const chars = Array.from(text);
  const cut = (length: number) => `${chars.slice(0, length).join("").trimEnd()}…`;
  let low = 0;
  let high = chars.length - 1;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (fits(cut(mid))) low = mid;
    else high = mid - 1;
  }
  return cut(low);
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

/** Font size and Inter optical size for an element drawn at `cssSize` px. */
function setSize(el: HTMLElement, cssSize: number) {
  el.style.fontSize = `${cssSize}px`;
  el.style.fontVariationSettings = `"opsz" ${opticalSize(cssSize)}`;
}

/**
 * Runs the whole pass on one poster root (`.gst-poster`). Each pass starts from the same state (step 0),
 * so calling it again, or under a scale transform, gives the same layout.
 */
export function layoutPoster(poster: HTMLElement): void {
  // Measurements are taken in poster space: the dialog shows the poster scaled down.
  const rootRect = poster.getBoundingClientRect();
  const k = rootRect.width > 0 ? rootRect.width / POSTER_WIDTH : 1;
  const width = (el: Element) => el.getBoundingClientRect().width / k;

  // 0. Reset everything a previous pass changed, including the optical size.
  for (const el of poster.querySelectorAll<HTMLElement>("[data-fs]")) {
    setSize(el, Number(el.dataset.fs));
  }
  for (const el of poster.querySelectorAll<HTMLElement>("[data-maxw]")) {
    for (const key of NAME_STYLE_KEYS) setStyle(el, key, "");
    const full = el.dataset.text;
    if (full !== undefined && el.textContent !== full) el.textContent = full;
    const parent = el.parentElement;
    if (parent) {
      parent.style.whiteSpace = "";
      parent.style.lineHeight = "";
    }
  }

  // 1. Names, each trial size measured at the optical size it renders with.
  for (const el of poster.querySelectorAll<HTMLElement>("[data-maxw]")) {
    const max = Number(el.dataset.maxw);
    const base = Number(el.dataset.fs) || parseFloat(getComputedStyle(el).fontSize);
    const fit = fitName(
      (scale) => {
        setSize(el, base * scale);
        return width(el);
      },
      max,
      el.dataset.lines === "2",
    );
    setSize(el, base * fit.scale);
    if (fit.mode === "fits" || fit.mode === "shrink") continue;
    const full = el.dataset.text ?? el.textContent ?? "";
    const fitsAs = (candidate: string, fits: () => boolean) => {
      el.textContent = candidate;
      return fits();
    };
    if (fit.mode === "two-lines") {
      setStyle(el, "display", "-webkit-box");
      setStyle(el, "webkitBoxOrient", "vertical");
      setStyle(el, "whiteSpace", "normal");
      setStyle(el, "textWrap", "balance");
      setStyle(el, "lineHeight", "1.15");
      setStyle(el, "width", `${max}px`);
      const parent = el.parentElement;
      if (parent) {
        parent.style.whiteSpace = "normal";
        parent.style.lineHeight = "1.15";
      }
      // Two lines at most (a third line would pass 2.5 line heights, whatever mixed fonts add to a line
      // box), and no word wider than the slot (one without spaces cannot wrap and would run out sideways,
      // cut off with no "…"); past that, the text ends in "…". scrollWidth is layout px, unscaled, so it
      // needs no `k`. line-clamp stays as a safety net for the live preview.
      setStyle(el, "overflow", "hidden");
      const lineHeight = 1.15 * base * fit.scale;
      el.textContent = ellipsize(full, (candidate) =>
        fitsAs(
          candidate,
          () => el.getBoundingClientRect().height / k < 2.5 * lineHeight && el.scrollWidth <= Math.ceil(max + FIT_EPSILON),
        ),
      );
      setStyle(el, "webkitLineClamp", "2");
    } else if (fit.mode === "ellipsis") {
      setStyle(el, "display", "inline-block");
      setStyle(el, "verticalAlign", "top");
      el.textContent = ellipsize(full, (candidate) => fitsAs(candidate, () => width(el) <= max + FIT_EPSILON));
      setStyle(el, "maxWidth", `${max}px`);
      setStyle(el, "overflow", "hidden");
    }
  }

  // 2. Groups fitted to a width (hero + em-sized unit scale together, keeping the unit ratio).
  for (const el of poster.querySelectorAll<HTMLElement>("[data-fit]")) {
    const size = parseFloat(getComputedStyle(el).fontSize);
    el.style.fontSize = `${fitToWidth(size, width(el), Number(el.dataset.fit))}px`;
  }

  // 3. Inter's optical size follows the size the text has in the PNG (2× its CSS px), as in the mockups,
  //    which were drawn at PNG size; this catches the groups step 2 resized. The hero keeps its own fixed
  //    display size (posters.css).
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
