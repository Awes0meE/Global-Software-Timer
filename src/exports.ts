// The page CSV exports (spec v0.4.2, decisions C to E): each builder turns the summary its page already
// reads into CSV text without a BOM (Rust adds it when writing), and `buildCsvExport` fetches that summary
// for the viewed day or range. No program paths: rows carry display and process names only.
import {
  getBackgroundPageSummary,
  getDashboardSummary,
  getSoftwarePageSummary,
  getStatisticsSummary,
  type BackgroundPageSummary,
  type DashboardSummary,
  type SaveTextExportArgs,
  type SoftwarePageRow,
  type SoftwarePageSummary,
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
  statisticsFileName,
  toCsv,
  type CsvValue,
} from "./csv";
import { runtimeStatusLabelZh } from "./i18n";
import type { ExportActionId } from "./pageExports";
import { formatLocalDate } from "./statisticsRange";

export type CsvExportAction = Extract<
  ExportActionId,
  "overview-csv" | "software-csv" | "background-csv" | "statistics-csv"
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
] as const;

const MEBIBYTE = 1024 * 1024;

export function isCsvExportAction(action: ExportActionId): action is CsvExportAction {
  return action === "overview-csv" || action === "software-csv" || action === "background-csv" || action === "statistics-csv";
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
 * 统计 区间汇总: one row per software the page's 区间排行, 开着没用 and 会话 ledgers list, ranked software
 * first. A figure a ledger does not hold for that software is left empty. `processNames` maps identity keys
 * to process names (the statistics summary has none).
 */
export function statisticsCsv(summary: StatisticsSummary, processNames: ReadonlyMap<string, string> = new Map()): string {
  interface Entry {
    name: string;
    rank?: number;
    focused?: number;
    window?: number;
    idle?: number;
    launches?: number;
    average?: number;
    longest?: number;
  }
  const entries = new Map<string, Entry>();
  const entry = (key: string, name: string) => {
    let current = entries.get(key);
    if (!current) {
      current = { name };
      entries.set(key, current);
    }
    return current;
  };

  for (const row of summary.ranking) {
    Object.assign(entry(row.identity_key, row.display_name), {
      rank: row.rank,
      focused: row.focused_seconds,
      window: row.window_seconds,
    });
  }
  for (const row of summary.idle_open) {
    const current = entry(row.identity_key, row.display_name);
    current.focused ??= row.focused_seconds;
    current.window ??= row.window_seconds;
    current.idle = row.idle_seconds;
  }
  for (const row of summary.sessions) {
    Object.assign(entry(row.identity_key, row.display_name), {
      launches: row.launch_count,
      average: row.average_seconds,
      longest: row.longest_seconds,
    });
  }

  const hours = (seconds: number | undefined) => (seconds === undefined ? null : formatHours(seconds));
  const rows = Array.from(entries, ([key, row]): CsvValue[] => [
    row.name,
    processNames.get(key) ?? null,
    row.rank ?? null,
    hours(row.focused),
    hours(row.window),
    hours(row.idle),
    row.launches ?? null,
    hours(row.average),
    hours(row.longest),
  ]);
  return toCsv(STATISTICS_CSV_COLUMNS, rows);
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
      const scope = context.statistics;
      if (!scope) throw new Error("statistics_scope_unknown");
      const [summary, software] = await Promise.all([
        getStatisticsSummary(scope),
        // Process names only; the file is still useful without them.
        getSoftwarePageSummary().catch(() => null),
      ]);
      return csvFile(statisticsFileName(summary.start, summary.end), statisticsCsv(summary, processNameMap(software)));
    }
  }
}

function csvFile(suggestedName: string, contents: string): SaveTextExportArgs {
  return { suggestedName, filterName: CSV_FILTER.filterName, extension: CSV_FILTER.extension, contents };
}

function processNameMap(summary: SoftwarePageSummary | null): Map<string, string> {
  const names = new Map<string, string>();
  for (const row of summary ? [...summary.focused, ...summary.hidden, ...summary.discovered] : []) {
    if (!names.has(row.identity_key)) names.set(row.identity_key, row.process_name);
  }
  return names;
}

/** An RFC 3339 timestamp as local "YYYY-MM-DD HH:MM"; empty for never or an unreadable value. */
export function formatLocalDateTime(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${formatLocalDate(date)} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
