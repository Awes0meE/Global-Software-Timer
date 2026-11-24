// CSV text for the page exports. RFC 4180 quoting, CRLF record ends, and a
// formula-injection guard on text cells. The UTF-8 BOM is added in Rust by
// `save_text_export`, so the text built here never starts with one.

export type CsvValue = string | number | null | undefined;

const FORMULA_START = /^[=+\-@\t\r]/;
const NEEDS_QUOTES = /[",\r\n]/;

/** One cell: text that a spreadsheet could run as a formula gets a leading `'`. */
export function csvCell(value: CsvValue): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  const guarded = FORMULA_START.test(value) ? `'${value}` : value;
  return NEEDS_QUOTES.test(guarded) ? `"${guarded.replace(/"/g, '""')}"` : guarded;
}

export function toCsv(columns: readonly string[], rows: readonly (readonly CsvValue[])[]): string {
  return [columns, ...rows].map((record) => `${record.map(csvCell).join(",")}\r\n`).join("");
}

/** Seconds as hours with two decimals ("5.40"). */
export function formatHours(seconds: number): string {
  const safe = Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
  return (safe / 3600).toFixed(2);
}

export const CSV_FILTER = { filterName: "CSV", extension: "csv" } as const;

export const DAILY_REPORT_CSV_COLUMNS = [
  "日期",
  "软件名称",
  "进程名",
  "当日运行(小时)",
  "当日活跃(小时)",
  "累计运行(小时)",
] as const;

export const SOFTWARE_LIST_CSV_COLUMNS = [
  "软件名称",
  "进程名",
  "分组",
  "状态",
  "最近打开",
  "今日前台(小时)",
  "今日后台(小时)",
  "今日专注(小时)",
  "累计前台(小时)",
  "累计后台(小时)",
  "累计专注(小时)",
] as const;

export const BACKGROUND_CSV_COLUMNS = [
  "日期",
  "软件名称",
  "进程名",
  "峰值进程数",
  "峰值内存(MB)",
  "后台时长(小时)",
  "CPU 时间(秒)",
] as const;

/** 日报 of the viewed day. */
export function dailyReportFileName(date: string): string {
  return `GST-日报-${date}.csv`;
}

/** 软件清单, dated today. */
export function softwareListFileName(date: string): string {
  return `GST-软件清单-${date}.csv`;
}

/** 后台 records of the viewed day. */
export function backgroundFileName(date: string): string {
  return `GST-后台-${date}.csv`;
}

/** 统计 区间汇总 for an inclusive range. */
export function statisticsFileName(start: string, end: string): string {
  return `GST-统计-${start}至${end}.csv`;
}
