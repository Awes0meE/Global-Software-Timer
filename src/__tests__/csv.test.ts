import { describe, expect, it } from "vitest";
import {
  BACKGROUND_CSV_COLUMNS,
  DAILY_REPORT_CSV_COLUMNS,
  SOFTWARE_LIST_CSV_COLUMNS,
  backgroundFileName,
  csvCell,
  dailyReportFileName,
  formatHours,
  softwareListFileName,
  statisticsDailyFileName,
  statisticsFileName,
  toCsv,
} from "../csv";

describe("toCsv", () => {
  it("joins cells with commas and ends every record with CRLF", () => {
    expect(toCsv(["a", "b"], [["1", 2], ["3", 4]])).toBe("a,b\r\n1,2\r\n3,4\r\n");
  });

  it("does not add a BOM (Rust adds it when writing)", () => {
    expect(toCsv(["日期"], []).startsWith("\uFEFF")).toBe(false);
    expect(toCsv(["日期"], [])).toBe("日期\r\n");
  });

  it("quotes cells with commas, quotes or line breaks (RFC 4180)", () => {
    expect(csvCell("a,b")).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell("two\nlines")).toBe('"two\nlines"');
    expect(csvCell("cr\r")).toBe('"cr\r"');
    expect(csvCell("plain 微信")).toBe("plain 微信");
  });

  it("guards text cells against formula injection", () => {
    expect(csvCell("=1+1")).toBe("'=1+1");
    expect(csvCell("+cmd")).toBe("'+cmd");
    expect(csvCell("-2")).toBe("'-2");
    expect(csvCell("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(csvCell("\tx")).toBe("'\tx");
    expect(csvCell("\rx")).toBe("\"'\rx\"");
    expect(csvCell('=HYPERLINK("x")')).toBe('"\'=HYPERLINK(""x"")"');
    expect(csvCell("a=b")).toBe("a=b");
  });

  it("writes numbers as they are and empty values as empty cells", () => {
    expect(csvCell(42)).toBe("42");
    expect(csvCell(-3)).toBe("-3");
    expect(csvCell(null)).toBe("");
    expect(csvCell(undefined)).toBe("");
    expect(csvCell(Number.NaN)).toBe("");
  });
});

describe("formatHours", () => {
  it("formats seconds as hours with two decimals", () => {
    expect(formatHours(5.4 * 3600)).toBe("5.40");
    expect(formatHours(0)).toBe("0.00");
    expect(formatHours(59)).toBe("0.02");
    expect(formatHours(36_000)).toBe("10.00");
  });

  it("never prints negative or invalid durations", () => {
    expect(formatHours(-10)).toBe("0.00");
    expect(formatHours(Number.NaN)).toBe("0.00");
  });
});

describe("export file names", () => {
  it("follow the approved patterns", () => {
    expect(dailyReportFileName("2026-11-17")).toBe("GST-日报-2026-11-17.csv");
    expect(softwareListFileName("2026-11-24")).toBe("GST-软件清单-2026-11-24.csv");
    expect(backgroundFileName("2026-11-17")).toBe("GST-后台-2026-11-17.csv");
    expect(statisticsFileName("2026-11-01", "2026-11-24")).toBe("GST-统计-2026-11-01至2026-11-24.csv");
    expect(statisticsDailyFileName("2026-11-01", "2026-11-24")).toBe("GST-统计每日明细-2026-11-01至2026-11-24.csv");
  });
});

describe("column headers", () => {
  it("match the spec exactly", () => {
    expect(DAILY_REPORT_CSV_COLUMNS).toEqual([
      "日期",
      "软件名称",
      "进程名",
      "当日运行(小时)",
      "当日活跃(小时)",
      "累计运行(小时)",
    ]);
    expect(SOFTWARE_LIST_CSV_COLUMNS).toEqual([
      "软件名称",
      "进程名",
      "分组",
      "状态",
      "最近打开",
      "今日窗口(小时)",
      "今日后台(小时)",
      "今日专注(小时)",
      "累计窗口(小时)",
      "累计后台(小时)",
      "累计专注(小时)",
    ]);
    expect(BACKGROUND_CSV_COLUMNS).toEqual([
      "日期",
      "软件名称",
      "进程名",
      "峰值进程数",
      "峰值内存(MB)",
      "后台时长(小时)",
      "CPU 时间(秒)",
    ]);
  });
});
