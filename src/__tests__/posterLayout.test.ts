import { describe, expect, it } from "vitest";
import { achievementPosterFileName, dailyPosterFileName, fileNameSafe } from "../posters/fileNames";
import { capTopBaseline, fitName, fitToWidth, INTER_CAP_HEIGHT, opticalSize } from "../posters/layout";

describe("fitName", () => {
  it("keeps a name that fits", () => {
    expect(fitName(200, 250, false)).toEqual({ mode: "fits", scale: 1 });
  });

  it("shrinks down to 0.8x", () => {
    expect(fitName(300, 250, true)).toEqual({ mode: "shrink", scale: 250 / 300 });
    expect(fitName(312.5, 250, false)).toEqual({ mode: "shrink", scale: 0.8 });
  });

  it("wraps to two lines at 0.8x when allowed, else ellipsises", () => {
    expect(fitName(600, 295, true)).toEqual({ mode: "two-lines", scale: 0.8 });
    expect(fitName(600, 125, false)).toEqual({ mode: "ellipsis", scale: 0.8 });
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
