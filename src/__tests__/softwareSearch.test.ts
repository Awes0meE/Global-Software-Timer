import { describe, expect, it } from "vitest";
import {
  formatLastOpenedAt,
  highlightDisplayName,
  rankSoftwareRows,
  type SearchableSoftwareRow,
} from "../softwareSearch";

function row(overrides: Partial<SearchableSoftwareRow>): SearchableSoftwareRow {
  return {
    identity_key: "app:test",
    display_name: "Test App",
    mark: "none",
    last_opened_at: "2026-06-05T01:00:00Z",
    ...overrides,
  };
}

describe("softwareSearch", () => {
  it("ranks starts-with matches above contains matches", () => {
    const rows = [
      row({ identity_key: "vscode", display_name: "Visual Studio Code" }),
      row({ identity_key: "chrome", display_name: "Chrome" }),
    ];

    expect(rankSoftwareRows(rows, "c").map((item) => item.identity_key)).toEqual([
      "chrome",
      "vscode",
    ]);
  });

  it("supports pinyin full spelling and initials for Chinese names", () => {
    const rows = [row({ identity_key: "wechat", display_name: "微信" })];

    expect(rankSoftwareRows(rows, "weixin")).toHaveLength(1);
    expect(rankSoftwareRows(rows, "wx")).toHaveLength(1);
    expect(rankSoftwareRows(rows, "微")).toHaveLength(1);
  });

  it("supports built-in offline aliases for common English software names", () => {
    const rows = [
      row({
        identity_key: "app:wechat",
        display_name: "WeChat",
        process_name: "WeChat.exe",
      }),
      row({
        identity_key: "known:wps-office",
        display_name: "WPS Office",
        process_name: "wps.exe",
      }),
    ];

    expect(rankSoftwareRows(rows, "微信").map((item) => item.identity_key)).toEqual([
      "app:wechat",
    ]);
    expect(rankSoftwareRows(rows, "weixin").map((item) => item.identity_key)).toEqual([
      "app:wechat",
    ]);
    expect(rankSoftwareRows(rows, "jsbg").map((item) => item.identity_key)).toEqual([
      "known:wps-office",
    ]);
  });

  it("highlights visible English and Chinese matches only", () => {
    expect(highlightDisplayName("Chrome", "ch")).toEqual([
      { text: "Ch", highlighted: true },
      { text: "rome", highlighted: false },
    ]);
    expect(highlightDisplayName("微信", "微")).toEqual([
      { text: "微", highlighted: true },
      { text: "信", highlighted: false },
    ]);
    expect(highlightDisplayName("微信", "wx")).toEqual([
      { text: "微信", highlighted: false },
    ]);
    expect(highlightDisplayName("WeChat", "微信")).toEqual([
      { text: "WeChat", highlighted: false },
    ]);
  });

  it("formats last opened times with approved Chinese copy", () => {
    const now = new Date("2026-06-05T12:00:00+08:00");
    const options = { timeZone: "Asia/Shanghai" };

    expect(formatLastOpenedAt("2026-06-05T11:50:00+08:00", now, options)).toBe("10分钟前");
    expect(formatLastOpenedAt("2026-06-05T09:42:00+08:00", now, options)).toBe("今天 09:42");
    expect(formatLastOpenedAt("2026-06-04T21:18:00+08:00", now, options)).toBe("昨天 21:18");
    expect(formatLastOpenedAt("2026-06-03T15:09:00+08:00", now, options)).toBe("前天 15:09");
    expect(formatLastOpenedAt("2026-06-02T08:00:00+08:00", now, options)).toBe("这周二");
    expect(formatLastOpenedAt("2026-05-27T08:00:00+08:00", now, options)).toBe("上周三");
    expect(formatLastOpenedAt("2026-05-01T08:00:00+08:00", now, options)).toBe("2026-05-01");
  });

  it("honors an explicit time zone for deterministic formatting", () => {
    const now = new Date("2026-06-05T12:00:00+08:00");

    expect(formatLastOpenedAt("2026-06-05T09:42:00+08:00", now, { timeZone: "UTC" })).toBe(
      "今天 01:42",
    );
  });

  it("only labels the current and immediately previous Monday-based weeks", () => {
    const now = new Date("2026-06-08T12:00:00+08:00");
    const options = { timeZone: "Asia/Shanghai" };

    expect(formatLastOpenedAt("2026-06-05T08:00:00+08:00", now, options)).toBe("上周五");
    expect(formatLastOpenedAt("2026-05-26T08:00:00+08:00", now, options)).toBe("2026-05-26");
  });

  it("sorts empty queries by last opened descending", () => {
    const rows = [
      row({ identity_key: "old", display_name: "Old", last_opened_at: "2026-06-01T01:00:00Z" }),
      row({ identity_key: "new", display_name: "New", last_opened_at: "2026-06-05T01:00:00Z" }),
      row({ identity_key: "never", display_name: "Never", last_opened_at: null }),
    ];

    expect(rankSoftwareRows(rows, "").map((item) => item.identity_key)).toEqual([
      "new",
      "old",
      "never",
    ]);
  });

  it("preserves original order for empty-query rows with equal last opened times", () => {
    const rows = [
      row({
        identity_key: "first",
        display_name: "First",
        last_opened_at: "2026-06-05T01:00:00Z",
      }),
      row({
        identity_key: "second",
        display_name: "Second",
        last_opened_at: "2026-06-05T01:00:00Z",
      }),
    ];

    expect(rankSoftwareRows(rows, "").map((item) => item.identity_key)).toEqual([
      "first",
      "second",
    ]);
  });

  it("returns no rows for a query with no match", () => {
    const rows = [row({ identity_key: "wechat", display_name: "微信" })];

    expect(rankSoftwareRows(rows, "photoshop")).toEqual([]);
  });

  it("formats null and invalid last opened values as never opened", () => {
    expect(formatLastOpenedAt(null, new Date("2026-06-05T12:00:00+08:00"))).toBe("从未打开");
    expect(formatLastOpenedAt("not-a-date", new Date("2026-06-05T12:00:00+08:00"))).toBe(
      "从未打开",
    );
  });

  it("clamps future timestamps within clock skew to zero minutes ago", () => {
    expect(
      formatLastOpenedAt(
        "2026-06-05T12:05:00+08:00",
        new Date("2026-06-05T12:00:00+08:00"),
      ),
    ).toBe("0分钟前");
  });
});
