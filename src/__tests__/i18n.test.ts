import { describe, expect, it } from "vitest";
import { formatDurationZh } from "../i18n";

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
});
