import { describe, expect, it } from "vitest";
import { achievementPosterFileName, dailyPosterFileName, fileNameSafe } from "../posters/fileNames";
import { capTopBaseline, ellipsize, fitName, fitToWidth, INTER_CAP_HEIGHT, opticalSize } from "../posters/layout";

/** A name `width` px wide at its base size; Inter at a lower optical size is `widen` × wider per unit of shrink. */
function textAt(width: number, widen = 0) {
  const calls: number[] = [];
  const measure = (scale: number) => {
    calls.push(scale);
    return width * scale * (1 + widen * (1 - scale));
  };
  return { measure, calls };
}

describe("fitName", () => {
  it("keeps a name that fits", () => {
    expect(fitName(textAt(200).measure, 250, false)).toEqual({ mode: "fits", scale: 1 });
  });

  it("shrinks down to 0.8x", () => {
    expect(fitName(textAt(300).measure, 250, true)).toEqual({ mode: "shrink", scale: 250 / 300 });
    expect(fitName(textAt(312.5).measure, 250, false)).toEqual({ mode: "shrink", scale: 0.8 });
  });

  it("wraps to two lines at 0.8x when allowed, else ellipsises", () => {
    expect(fitName(textAt(600).measure, 295, true)).toEqual({ mode: "two-lines", scale: 0.8 });
    expect(fitName(textAt(600).measure, 125, false)).toEqual({ mode: "ellipsis", scale: 0.8 });
  });

  it("measures every trial size instead of extrapolating, so a lower optical size cannot overflow", () => {
    // 2% too wide; each step down widens the text a little (lower opsz), so one ratio step is not enough.
    const text = textAt(295 * 1.02, 0.15);
    const fit = fitName(text.measure, 295, true);
    expect(fit.mode).toBe("shrink");
    expect(fit.scale).toBeGreaterThanOrEqual(0.8);
    expect(text.measure(fit.scale)).toBeLessThanOrEqual(295.01);
    expect(text.calls.length).toBeGreaterThan(2);
  });

  it("gives the same answer whatever was measured before", () => {
    const first = fitName(textAt(301, 0.15).measure, 295, true);
    const again = fitName(textAt(301, 0.15).measure, 295, true);
    expect(again).toEqual(first);
  });

  it("goes to two lines only when the 0.8x size, measured, is still too wide", () => {
    // At 0.8x: 370 -> 296 px, too wide; 368 -> 294.4 px, fits (shrunk a little less than 0.8x).
    expect(fitName(textAt(370).measure, 295, true).mode).toBe("two-lines");
    expect(fitName(textAt(368).measure, 295, true).mode).toBe("shrink");
  });
});

describe("ellipsize", () => {
  const upTo = (length: number) => (text: string) => Array.from(text).length <= length;

  it("keeps a name that fits", () => {
    expect(ellipsize("Visual Studio Code", upTo(40))).toBe("Visual Studio Code");
  });

  it("keeps the longest prefix that fits with the ellipsis, without a space before it", () => {
    expect(ellipsize("Visual Studio Code", upTo(10))).toBe("Visual St…");
    expect(ellipsize("Visual Studio Code", upTo(8))).toBe("Visual…");
  });

  it("cuts between whole characters, not inside a surrogate pair", () => {
    expect(ellipsize("网易云音乐𠮷𠮷𠮷", upTo(7))).toBe("网易云音乐𠮷…");
  });

  it("falls back to the ellipsis alone", () => {
    expect(ellipsize("Visual Studio Code", () => false)).toBe("…");
  });
});

describe("hero fit and cap top", () => {
  it("shrinks a group only when it is wider than its slot", () => {
    expect(fitToWidth(150, 300, 362)).toBe(150);
    expect(fitToWidth(150, 724, 362)).toBe(75);
  });

  it("puts the figure tops at the cap-top line for every hero size", () => {
    expect(capTopBaseline(339, 150)).toBeCloseTo(339 + 150 * (1490 / 2048), 6);
    for (const size of [150, 120, 96]) {
      expect(capTopBaseline(339, size) - INTER_CAP_HEIGHT * size).toBeCloseTo(339, 6);
    }
  });

  it("sets Inter's optical size from the PNG size, within the axis", () => {
    expect(opticalSize(12)).toBe(24);
    expect(opticalSize(5)).toBe(14);
    expect(opticalSize(24)).toBe(32);
    expect(opticalSize(9.6)).toBe(19.2);
  });
});

describe("poster file names", () => {
  it("dates the daily poster with the viewed day", () => {
    expect(dailyPosterFileName("2026-11-25")).toBe("GST-日报-2026-11-25.png");
  });

  it("names the achievement poster after the software and the reached date", () => {
    expect(achievementPosterFileName("Visual Studio Code", "2026-11-20")).toBe("GST-成就-Visual Studio Code-2026-11-20.png");
    expect(achievementPosterFileName("网易云音乐", "2026-07-21")).toBe("GST-成就-网易云音乐-2026-07-21.png");
  });

  it("strips characters Windows does not allow and trailing dots and spaces", () => {
    expect(fileNameSafe('a\\b/c:d*e?f"g<h>i|j')).toBe("abcdefghij");
    expect(fileNameSafe("Tab\tNew\nLine\u007f")).toBe("TabNewLine");
    expect(fileNameSafe("Setup v2. . ")).toBe("Setup v2");
    expect(fileNameSafe(' <>:"/\\|?* ')).toBe("软件");
    expect(achievementPosterFileName("C:/Tools/App?", "2026-11-22")).toBe("GST-成就-CToolsApp-2026-11-22.png");
  });
});
