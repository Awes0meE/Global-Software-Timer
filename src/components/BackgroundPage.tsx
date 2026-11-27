import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useContentSwap } from "../motion";
import { pageReads } from "../pageReads";
import { ArrowDownWideNarrow, ArrowUpNarrowWide } from "lucide-react";
import {
  getBackgroundPageSummary,
  type BackgroundPageSummary,
  type BackgroundRow,
  type DurationFormat,
} from "../api";
import { formatDurationZh } from "../i18n";
import { answersDay, isDayInvalidDate } from "../viewedDay";
import { startVisiblePolling } from "../visiblePolling";
import { HelpPopover } from "./ActiveTimeHelpPopover";
import { SoftwareIcon } from "./SoftwareIcon";

interface BackgroundPageProps {
  /** A past day's local `YYYY-MM-DD`, read once; omitted for today, which stays live. */
  date?: string;
  durationFormat?: DurationFormat;
  /** The backend refused `date` (malformed or in the future). */
  onInvalidDate?: () => void;
}

export type BackgroundSortKey =
  | "name"
  | "process_count"
  | "cpu_percent"
  | "memory"
  | "running_seconds"
  | "cpu_seconds"
  | "status";

export type SortDirection = "desc" | "asc";

export interface BackgroundSort {
  key: BackgroundSortKey;
  direction: SortDirection;
}

const COLUMNS: Array<{ key: BackgroundSortKey; label: string }> = [
  { key: "name", label: "软件名称" },
  { key: "process_count", label: "进程数" },
  { key: "cpu_percent", label: "当前 CPU" },
  { key: "memory", label: "内存" },
  { key: "running_seconds", label: "今日后台时长" },
  { key: "cpu_seconds", label: "今日 CPU 时间" },
  { key: "status", label: "状态" },
];

/** A past day has no "now": no current CPU or running status, and its counts and memory are the day's peaks. */
const PAST_COLUMNS: Array<{ key: BackgroundSortKey; label: string }> = [
  { key: "name", label: "软件名称" },
  { key: "process_count", label: "峰值进程数" },
  { key: "memory", label: "峰值内存" },
  { key: "running_seconds", label: "当日后台时长" },
  { key: "cpu_seconds", label: "当日 CPU 时间" },
];

/** Matches the backend's own order, so the first paint does not reshuffle rows. */
const DEFAULT_SORT: BackgroundSort = { key: "cpu_seconds", direction: "desc" };

const nameCollator = new Intl.Collator("zh-Hans-CN", { numeric: true, sensitivity: "base" });

/** Value to sort by; null means "no value shown" (e.g. "—") and always sorts last. */
function sortValue(row: BackgroundRow, key: BackgroundSortKey, pastDay: boolean): number | string | null {
  switch (key) {
    case "name":
      return row.display_name;
    case "process_count":
      // Today shows the count only for running software; a past day shows every row's peak.
      return row.is_running || pastDay ? row.process_count : null;
    case "cpu_percent":
      return row.cpu_percent;
    case "memory":
      return row.memory_bytes;
    case "running_seconds":
      return row.today_running_seconds;
    case "cpu_seconds":
      return row.today_cpu_seconds;
    case "status":
      return row.is_running ? 1 : 0;
  }
}

/**
 * Sorts rows like a spreadsheet column: "desc" is high to low (Z to A for
 * names), "asc" the reverse. Empty values stay at the bottom in both
 * directions, and ties keep the backend order. `pastDay` sorts 峰值进程数 on every row's peak.
 */
export function sortBackgroundRows(
  rows: BackgroundRow[],
  sort: BackgroundSort,
  pastDay = false,
): BackgroundRow[] {
  const sign = sort.direction === "desc" ? -1 : 1;
  return [...rows].sort((left, right) => {
    const a = sortValue(left, sort.key, pastDay);
    const b = sortValue(right, sort.key, pastDay);
    if (a === null || b === null) return a === b ? 0 : a === null ? 1 : -1;
    const order = typeof a === "string" && typeof b === "string"
      ? nameCollator.compare(a, b)
      : (a as number) - (b as number);
    return sign * order;
  });
}

/** First click on a column sorts high to low; clicking it again flips the direction. */
export function nextBackgroundSort(current: BackgroundSort, key: BackgroundSortKey): BackgroundSort {
  if (current.key !== key) return { key, direction: "desc" };
  return { key, direction: current.direction === "desc" ? "asc" : "desc" };
}

export function BackgroundPage({ date, durationFormat = "decimal_hours", onInvalidDate }: BackgroundPageProps) {
  const [summary, setSummary] = useState<BackgroundPageSummary | null>(() =>
    pageReads.background !== null && answersDay(pageReads.background, date ?? null) ? pageReads.background : null,
  );
  const swapContent = useContentSwap(summary?.usage_date ?? null);
  const [fetchError, setFetchError] = useState(false);
  const [sort, setSort] = useState<BackgroundSort>(DEFAULT_SORT);
  const mountedRef = useRef(false);
  // The day the latest request is for (null: today); answers for any other day are dropped.
  const dayRef = useRef<string | null>(date ?? null);
  const invalidDateRef = useRef(onInvalidDate);
  invalidDateRef.current = onInvalidDate;
  // Until the new day's read lands, the figures on screen are another day's: they show dimmed and busy,
  // and after a failed read only the warning shows, so the header date never heads other figures.
  const summaryIsForView = summary !== null && answersDay(summary, date ?? null);
  const shownSummary = summaryIsForView || !fetchError ? summary : null;
  const summaryIsStale = shownSummary !== null && !summaryIsForView;
  // The wording and columns follow the rows on screen, so they always name the same day.
  const pastDay = shownSummary?.is_today === false;
  // A past day hides 当前 CPU and 状态; sorting by either falls back to the default.
  if (pastDay && !PAST_COLUMNS.some((column) => column.key === sort.key)) {
    setSort(DEFAULT_SORT);
  }
  const sortedRows = useMemo(
    () => (shownSummary ? sortBackgroundRows(shownSummary.rows, sort, shownSummary.is_today === false) : []),
    [shownSummary, sort],
  );

  const refresh = useCallback(async () => {
    const day = dayRef.current;
    const isCurrent = () => mountedRef.current && dayRef.current === day;
    try {
      const next = await getBackgroundPageSummary(day ?? undefined);
      if (!isCurrent() || !answersDay(next, day)) return;
      pageReads.background = next;
      swapContent(next.usage_date, next.usage_date, () => {
        setSummary(next);
        setFetchError(false);
      });
    } catch (reason) {
      if (!isCurrent()) return;
      if (day !== null && isDayInvalidDate(reason)) {
        invalidDateRef.current?.();
        return;
      }
      setFetchError(true);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Today stays live; a past day's stored rows do not change, so they are read once.
  useEffect(() => {
    const day = date ?? null;
    dayRef.current = day;
    // A failed read for the previous day says nothing about the day being read now.
    setFetchError(false);
    if (day !== null) {
      void refresh();
      return undefined;
    }
    return startVisiblePolling(refresh, 5000);
  }, [date, refresh]);

  if (!shownSummary) {
    return (
      <main className="background-page" id="background-content">
        {fetchError ? <div className="warning" role="alert">无法读取后台进程</div>
          : <p role="status" className="empty-state">正在读取后台进程…</p>}
      </main>
    );
  }

  return (
    <main
      className={`background-page${summaryIsStale ? " is-stale" : ""}`}
      id="background-content"
      aria-busy={summaryIsStale || undefined}
    >
      {fetchError ? <div className="warning" role="alert">无法读取后台进程</div> : null}

      <section className="panel background-summary" aria-label="后台概况">
        <div className={`lcd background-strip${pastDay ? " is-past" : ""}`}>
          {(pastDay ? pastBackgroundReadings : backgroundReadings)(shownSummary, durationFormat).map((reading) => (
            <div className="background-reading" key={reading.label}>
              <span>{reading.label}</span>
              <p>
                {splitReading(reading.value).map((part, index) =>
                  part.unit ? (
                    <small key={index} className={part.text === "%" ? "is-pct" : undefined}>
                      {part.text}
                    </small>
                  ) : (
                    <b key={index}>{part.text}</b>
                  ),
                )}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="panel table-panel" aria-label="后台进程列表">
        <header className="panel-head">
          <h2>后台进程</h2>
          <HelpPopover label="什么是后台进程" title="什么是后台进程？" align="start">
            <p>没有窗口、也不在托盘里的第三方程序。Windows 系统进程不列出；由正在使用的软件启动的子进程，算在那个软件名下。</p>
            <p>内存：运行中的进程显示当前占用，其余显示当日峰值。</p>
            <p>往日的峰值内存是各软件当日峰值之和，这些峰值不一定同时出现。</p>
          </HelpPopover>
        </header>
        <div className="usage-scroll" role="region" tabIndex={0} aria-label="后台进程明细">
          <table className={`background-table${pastDay ? " is-past" : ""}`}>
            <thead>
              <tr>
                {(pastDay ? PAST_COLUMNS : COLUMNS).map((column) => (
                  <SortableHeader
                    key={column.key}
                    label={column.label}
                    direction={sort.key === column.key ? sort.direction : null}
                    onSort={() => setSort((current) => nextBackgroundSort(current, column.key))}
                  />
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedRows.map((row) => (
                <BackgroundRowView
                  key={row.family_key}
                  row={row}
                  durationFormat={durationFormat}
                  pastDay={pastDay}
                />
              ))}
            </tbody>
          </table>
          {shownSummary.rows.length === 0 && (
            <div className="empty-state">{pastDay ? "这一天没有后台记录。" : "今天还没有记录到后台进程。"}</div>
          )}
        </div>
      </section>
    </main>
  );
}

function SortableHeader({
  label,
  direction,
  onSort,
}: {
  label: string;
  /** Current direction when this column is the sort column, otherwise null. */
  direction: SortDirection | null;
  onSort: () => void;
}) {
  // An inactive column previews the order its first click gives (high to low).
  const shown = direction ?? "desc";
  const Icon = shown === "desc" ? ArrowDownWideNarrow : ArrowUpNarrowWide;
  const hint = direction === "desc" ? "点击改为从低到高" : "点击按从高到低排序";
  return (
    <th
      scope="col"
      aria-sort={direction === null ? "none" : direction === "desc" ? "descending" : "ascending"}
    >
      <button
        type="button"
        className={`sort-button${direction ? " is-active" : ""}`}
        title={hint}
        onClick={onSort}
      >
        <span>{label}</span>
        <Icon
          className={`sort-icon ${shown}`}
          size={14}
          strokeWidth={2}
          aria-hidden="true"
          data-sort-icon={shown}
        />
      </button>
    </th>
  );
}

function BackgroundRowView({
  row,
  durationFormat,
  pastDay,
}: {
  row: BackgroundRow;
  durationFormat: DurationFormat;
  /** Only the day's stored peaks and totals: no current CPU and no status cells. */
  pastDay: boolean;
}) {
  return (
    <tr className="background-row">
      <td>
        <div className="software-cell">
          <SoftwareIcon app={row} />
          <span>
            <strong>{row.display_name}</strong>
            <small>{row.process_name}</small>
          </span>
        </div>
      </td>
      <td>{row.is_running || pastDay ? row.process_count : "—"}</td>
      {pastDay ? null : <td>{row.cpu_percent === null ? "—" : formatPercent(row.cpu_percent)}</td>}
      <td title={row.is_running ? "当前占用" : "当日峰值"}>{formatBytes(row.memory_bytes)}</td>
      <td>{formatDurationZh(row.today_running_seconds, durationFormat)}</td>
      <td>{formatCpuSeconds(row.today_cpu_seconds, durationFormat)}</td>
      {pastDay ? null : (
        <td>
          <span className={`status-badge ${row.is_running ? "background" : "closed"}`}>
            <i className="lamp" aria-hidden="true" />
            {row.is_running ? "运行中" : "已退出"}
          </span>
        </td>
      )}
    </tr>
  );
}

export interface BackgroundReading {
  label: string;
  value: string;
}

/**
 * The six figures on the summary strip, all derived from the summary the page already polls: what runs
 * now (software, processes, CPU, memory; running rows only) and what today added up to (CPU time and
 * software seen, exited rows included).
 */
export function backgroundReadings(
  summary: BackgroundPageSummary,
  durationFormat: DurationFormat = "decimal_hours",
): BackgroundReading[] {
  const running = summary.rows.filter((row) => row.is_running);
  const sum = (rows: BackgroundRow[], value: (row: BackgroundRow) => number) =>
    rows.reduce((total, row) => total + value(row), 0);
  return [
    { label: "正在后台运行", value: `${summary.running_count} 个` },
    { label: "进程", value: `${sum(running, (row) => row.process_count)} 个` },
    { label: "当前合计 CPU", value: formatPercent(sum(running, (row) => row.cpu_percent ?? 0)) },
    { label: "当前合计内存", value: formatBytes(sum(running, (row) => row.memory_bytes)) },
    {
      label: "今日 CPU 时间",
      value: formatCpuSeconds(sum(summary.rows, (row) => row.today_cpu_seconds), durationFormat),
    },
    { label: "今日出现", value: `${summary.rows.length} 个` },
  ];
}

/**
 * The four figures of a past day's strip: what that day added up to. Nothing ran "now" on a past day, so
 * the live figures go; 峰值内存 adds up each software's peak of the day, like the 峰值内存 column.
 */
export function pastBackgroundReadings(
  summary: BackgroundPageSummary,
  durationFormat: DurationFormat = "decimal_hours",
): BackgroundReading[] {
  const sum = (value: (row: BackgroundRow) => number) =>
    summary.rows.reduce((total, row) => total + value(row), 0);
  return [
    { label: "当日 CPU 时间", value: formatCpuSeconds(sum((row) => row.today_cpu_seconds), durationFormat) },
    { label: "当日出现", value: `${summary.rows.length} 个` },
    { label: "当日后台时长", value: formatDurationZh(sum((row) => row.today_running_seconds), durationFormat) },
    { label: "峰值内存", value: formatBytes(sum((row) => row.memory_bytes)) },
  ];
}

/** "64 MB" -> 64 + MB, "2小时1分钟" -> 2 + 小时 + 1 + 分钟: digits print large, units small. */
export function splitReading(value: string): Array<{ text: string; unit: boolean }> {
  return (value.replace(/\s+/g, "").match(/<?[\d.]+|[^\d<.]+/g) ?? []).map((text) => ({
    text,
    unit: !/^<?[\d.]+$/.test(text),
  }));
}

/**
 * CPU time (core-seconds) for the background table. Background processes often
 * use only seconds of CPU per day, so small values get seconds/minutes instead
 * of a misleading "0.0小时" / "0分钟"; larger values follow the user's format.
 */
export function formatCpuSeconds(
  seconds: number,
  durationFormat: DurationFormat = "decimal_hours",
): string {
  const value = Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
  if (value === 0) return "0秒";
  if (value < 1) return "<1秒";
  if (value < 60) return `${Math.floor(value)}秒`;
  if (durationFormat === "decimal_hours" && value < 360) {
    return `${Math.floor(value / 60)}分钟`;
  }
  return formatDurationZh(value, durationFormat);
}

export function formatPercent(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0%";
  if (value < 0.1) return "<0.1%";
  return `${value.toFixed(1)}%`;
}

export function formatBytes(bytes: number): string {
  const megabytes = Math.max(0, bytes) / (1024 * 1024);
  if (megabytes >= 1024) return `${(megabytes / 1024).toFixed(1)} GB`;
  return `${Math.round(megabytes)} MB`;
}
