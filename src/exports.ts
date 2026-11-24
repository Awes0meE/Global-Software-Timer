// The page CSV exports (spec v0.4.2, decisions C to E): each builder turns the summary its page already
// reads into CSV text without a BOM (Rust adds it when writing), and `buildCsvExport` fetches that summary
// for the viewed day or range. No program paths: rows carry display and process names only.
import {
  getBackgroundPageSummary,
  getDashboardSummary,
  getSoftwarePageSummary,
  getStatisticsExport,
  getStatisticsSummary,
  type BackgroundPageSummary,
  type DashboardSummary,
  type SaveTextExportArgs,
  type SoftwarePageRow,
  type SoftwarePageSummary,
  type StatisticsExport,
  type StatisticsSummary,
} from "./api";
import {
  BACKGROUND_CSV_COLUMNS,
  CSV_FILTER,
  DAILY_REPORT_CSV_COLUMNS,
  SOFTWARE_LIST_CSV_COLUMNS,
  backgroundFileName,
  dailyReportFileName,
  formatHours,
  softwareListFileName,
  statisticsDailyFileName,
  statisticsFileName,
  toCsv,
  type CsvValue,
} from "./csv";
import { runtimeStatusLabelZh } from "./i18n";
import type { ExportActionId } from "./pageExports";
import { formatLocalDate } from "./statisticsRange";

export type CsvExportAction = Extract<
  ExportActionId,
  "overview-csv" | "software-csv" | "background-csv" | "statistics-csv" | "statistics-daily-csv"
>;

/** The 统计 page's current selection: an inclusive local-date range and its 包含隐藏软件 switch. */
export interface StatisticsScope {
  start: string;
  end: string;
  includeHidden: boolean;
}

export interface CsvExportContext {
  /** The day 概览 and 后台 show ("YYYY-MM-DD"). */
  viewedDate: string;
  today: string;
  /** Null until the 统计 page reports its selection (App keeps the 导出报表 key busy until then). */
  statistics: StatisticsScope | null;
}

export const STATISTICS_CSV_COLUMNS = [
  "软件名称",
  "进程名",
  "排名",
  "焦点(小时)",
  "窗口开着(小时)",
  "开着没用(小时)",
  "打开次数",
  "平均单次(小时)",
  "最长单次(小时)",
  "后台(小时)",
  "使用天数",
] as const;

export const STATISTICS_DAILY_CSV_COLUMNS = [
  "日期",
  "软件名称",
  "进程名",
  "焦点(小时)",
  "窗口开着(小时)",
  "后台(小时)",
] as const;

const MEBIBYTE = 1024 * 1024;

const CSV_EXPORT_ACTIONS: ReadonlySet<ExportActionId> = new Set<CsvExportAction>([
  "overview-csv",
  "software-csv",
  "background-csv",
  "statistics-csv",
  "statistics-daily-csv",
]);

export function isCsvExportAction(action: ExportActionId): action is CsvExportAction {
  return CSV_EXPORT_ACTIONS.has(action);
}

/** 日报: the rows the 概览 table lists for `summary.usage_date` (the backend already leaves hidden software out). */
export function dailyReportCsv(summary: DashboardSummary): string {
  const rows = summary.apps.map((app): CsvValue[] => [
    summary.usage_date,
    app.display_name,
    app.process_name,
    formatHours(app.today_seconds),
    formatHours(app.active_today_seconds),
    formatHours(app.total_seconds),
  ]);
  return toCsv(DAILY_REPORT_CSV_COLUMNS, rows);
}

/** 软件清单: every identity once, in the order 特别关注, 隐藏, 已发现. */
export function softwareListCsv(summary: SoftwarePageSummary): string {
  const seen = new Set<string>();
  const rows: CsvValue[][] = [];
  const groups: Array<[string, SoftwarePageRow[]]> = [
    ["特别关注", summary.focused],
    ["隐藏", summary.hidden],
    ["已发现", summary.discovered],
  ];
  for (const [group, groupRows] of groups) {
    for (const row of groupRows) {
      if (seen.has(row.identity_key)) continue;
      seen.add(row.identity_key);
      rows.push([
        row.display_name,
        row.process_name,
        group,
        runtimeStatusLabelZh(row.status),
        formatLocalDateTime(row.last_opened_at),
        // The same fallbacks as the 软件 page when an older backend leaves the split out.
        formatHours(row.today_foreground_seconds ?? row.today_runtime_seconds),
        formatHours(row.today_background_seconds ?? 0),
        formatHours(row.today_focused_seconds),
        formatHours(row.total_foreground_seconds ?? row.total_runtime_seconds),
        formatHours(row.total_background_seconds ?? 0),
        formatHours(row.total_focused_seconds),
      ]);
    }
  }
  return toCsv(SOFTWARE_LIST_CSV_COLUMNS, rows);
}

/**
 * 后台 records of `summary.usage_date`: the day's peaks (today's include the live sample), never the current
 * count or memory, so every day's file means the same thing.
 */
export function backgroundCsv(summary: BackgroundPageSummary): string {
  const rows = summary.rows.map((row): CsvValue[] => [
    summary.usage_date,
    row.display_name,
    row.process_name,
    row.peak_process_count,
    (Math.max(0, row.peak_memory_bytes) / MEBIBYTE).toFixed(1),
    formatHours(row.today_running_seconds),
    Math.max(0, row.today_cpu_seconds).toFixed(1),
  ]);
  return toCsv(BACKGROUND_CSV_COLUMNS, rows);
}

/**
 * 统计 区间汇总 (spec v0.4.3 E): one row per software with any focus, window or background time in the
 * range, in the export's order (focus, then window, highest first, then name). 焦点, 窗口开着, 后台 and
 * 使用天数 come from the export; 排名, 开着没用 and the session figures from the page's ledgers, left empty
 * for a software those ledgers do not list.
 */
export function statisticsCsv(summary: StatisticsSummary, data: StatisticsExport): string {
  const ranks = new Map(summary.ranking.map((row) => [row.identity_key, row.rank]));
  const idle = new Map(summary.idle_open.map((row) => [row.identity_key, row.idle_seconds]));
  const sessions = new Map(summary.sessions.map((row) => [row.identity_key, row]));
  const hours = (seconds: number | undefined) => (seconds === undefined ? null : formatHours(seconds));

  const rows = data.software.map((row): CsvValue[] => {
    const session = sessions.get(row.identity_key);
    return [
      row.display_name,
      row.process_name,
      ranks.get(row.identity_key) ?? null,
      formatHours(row.focused_seconds),
      formatHours(row.window_seconds),
      hours(idle.get(row.identity_key)),
      session?.launch_count ?? null,
      hours(session?.average_seconds),
      hours(session?.longest_seconds),
      formatHours(row.background_seconds),
      row.used_days,
    ];
  });
  return toCsv(STATISTICS_CSV_COLUMNS, rows);
}

/** 统计 每日明细: one row per date × software with any time, in the export's order (date, then focus). */
export function statisticsDailyCsv(data: StatisticsExport): string {
  const rows = data.days.map((row): CsvValue[] => [
    row.date,
    row.display_name,
    row.process_name,
    formatHours(row.focused_seconds),
    formatHours(row.window_seconds),
    formatHours(row.background_seconds),
  ]);
  return toCsv(STATISTICS_DAILY_CSV_COLUMNS, rows);
}

/** Fetches the summary behind a page's CSV export and returns what `saveTextExport` needs. */
export async function buildCsvExport(action: CsvExportAction, context: CsvExportContext): Promise<SaveTextExportArgs> {
  // Today goes through the live path; only a past day is asked for by date.
  const day = context.viewedDate < context.today ? context.viewedDate : undefined;

  switch (action) {
    case "overview-csv": {
      const summary = await getDashboardSummary(day);
      return csvFile(dailyReportFileName(summary.usage_date), dailyReportCsv(summary));
    }
    case "software-csv": {
      const summary = await getSoftwarePageSummary();
      // Named for the day the numbers are read, even if App has not re-rendered since midnight.
      return csvFile(softwareListFileName(formatLocalDate(new Date())), softwareListCsv(summary));
    }
    case "background-csv": {
      const summary = await getBackgroundPageSummary(day);
      return csvFile(backgroundFileName(summary.usage_date), backgroundCsv(summary));
    }
    case "statistics-csv": {
      const scope = statisticsScope(context);
      const [summary, data] = await Promise.all([getStatisticsSummary(scope), getStatisticsExport(scope)]);
      return csvFile(statisticsFileName(data.start, data.end), statisticsCsv(summary, data));
    }
    case "statistics-daily-csv": {
      const data = await getStatisticsExport(statisticsScope(context));
      return csvFile(statisticsDailyFileName(data.start, data.end), statisticsDailyCsv(data));
    }
  }
}

function statisticsScope(context: CsvExportContext): StatisticsScope {
  if (!context.statistics) throw new Error("statistics_scope_unknown");
  return context.statistics;
}

function csvFile(suggestedName: string, contents: string): SaveTextExportArgs {
  return { suggestedName, filterName: CSV_FILTER.filterName, extension: CSV_FILTER.extension, contents };
}

/** An RFC 3339 timestamp as local "YYYY-MM-DD HH:MM"; empty for never or an unreadable value. */
export function formatLocalDateTime(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${formatLocalDate(date)} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
