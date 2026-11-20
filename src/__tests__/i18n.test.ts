import { describe, expect, it } from "vitest";
import { formatDurationPartsZh, formatDurationZh } from "../i18n";

describe("formatDurationZh", () => {
  it("formats durations as decimal hours with one fractional digit", () => {
    expect(formatDurationZh(8 * 3600 + 16 * 60)).toBe("8.3小时");
  });

  it("formats durations below one hour as decimal hours", () => {
    expect(formatDurationZh(42 * 60)).toBe("0.7小时");
  });

  it("rounds tiny and zero durations to zero decimal hours", () => {
    expect(formatDurationZh(1)).toBe("0.0小时");
    expect(formatDurationZh(59)).toBe("0.0小时");
    expect(formatDurationZh(0)).toBe("0.0小时");
  });

  it("formats concrete hours and minutes when minutes display is enabled", () => {
    expect(formatDurationZh(8 * 3600 + 35 * 60, "hours_minutes")).toBe("8小时35分钟");
    expect(formatDurationZh(42 * 60, "hours_minutes")).toBe("42分钟");
    expect(formatDurationZh(8 * 3600, "hours_minutes")).toBe("8小时");
    expect(formatDurationZh(59, "hours_minutes")).toBe("0分钟");
  });

  it("normalizes invalid minutes-display durations to zero", () => {
    expect(formatDurationZh(Number.NaN, "hours_minutes")).toBe("0分钟");
    expect(formatDurationZh(-60, "hours_minutes")).toBe("0分钟");
  });
});

describe("formatDurationPartsZh", () => {
  it("splits values from units and joins back to the plain format", () => {
    expect(formatDurationPartsZh(8 * 3600 + 16 * 60)).toEqual([{ value: "8.3", unit: "小时" }]);
    expect(formatDurationPartsZh(8 * 3600 + 35 * 60, "hours_minutes")).toEqual([
      { value: "8", unit: "小时" },
      { value: "35", unit: "分钟" },
    ]);
    expect(formatDurationPartsZh(42 * 60, "hours_minutes")).toEqual([{ value: "42", unit: "分钟" }]);

    for (const seconds of [0, 59, 42 * 60, 8 * 3600, 8 * 3600 + 35 * 60]) {
      for (const format of ["decimal_hours", "hours_minutes"] as const) {
        const joined = formatDurationPartsZh(seconds, format)
          .map((part) => `${part.value}${part.unit}`)
          .join("");
        expect(joined).toBe(formatDurationZh(seconds, format));
      }
    }
  });
});
