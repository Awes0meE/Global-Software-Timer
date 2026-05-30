import { describe, expect, it } from "vitest";
import { formatDurationZh } from "../i18n";

describe("formatDurationZh", () => {
  it("formats hours and minutes in Chinese long form", () => {
    expect(formatDurationZh(8 * 3600 + 16 * 60)).toBe("8小时16分钟");
  });

  it("formats durations below one hour as minutes", () => {
    expect(formatDurationZh(42 * 60)).toBe("42分钟");
  });

  it("formats positive durations below one minute as less than one minute", () => {
    expect(formatDurationZh(1)).toBe("<1分钟");
    expect(formatDurationZh(59)).toBe("<1分钟");
    expect(formatDurationZh(0)).toBe("0分钟");
  });
});
