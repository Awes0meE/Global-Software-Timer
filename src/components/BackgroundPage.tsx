import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowDownWideNarrow, ArrowUpNarrowWide } from "lucide-react";
import {
  getBackgroundPageSummary,
  type BackgroundPageSummary,
  type BackgroundRow,
  type DurationFormat,
} from "../api";
import { formatDurationZh } from "../i18n";
import { startVisiblePolling } from "../visiblePolling";
import { HelpPopover } from "./ActiveTimeHelpPopover";
import { SoftwareIcon } from "./SoftwareIcon";

interface BackgroundPageProps {
  durationFormat?: DurationFormat;
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

/** Matches the backend's own order, so the first paint does not reshuffle rows. */
const DEFAULT_SORT: BackgroundSort = { key: "cpu_seconds", direction: "desc" };

const nameCollator = new Intl.Collator("zh-Hans-CN", { numeric: true, sensitivity: "base" });

/** Value to sort by; null means "no value shown" (e.g. "—") and always sorts last. */
function sortValue(row: BackgroundRow, key: BackgroundSortKey): number | string | null {
  switch (key) {
    case "name":
      return row.display_name;
    case "process_count":
      return row.is_running ? row.process_count : null;
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
 * directions, and ties keep the backend order.
 */
export function sortBackgroundRows(rows: BackgroundRow[], sort: BackgroundSort): BackgroundRow[] {
  const sign = sort.direction === "desc" ? -1 : 1;
  return [...rows].sort((left, right) => {
    const a = sortValue(left, sort.key);
    const b = sortValue(right, sort.key);
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

export function BackgroundPage({ durationFormat = "decimal_hours" }: BackgroundPageProps) {
  const [summary, setSummary] = useState<BackgroundPageSummary | null>(null);
  const [fetchError, setFetchError] = useState(false);
  const [sort, setSort] = useState<BackgroundSort>(DEFAULT_SORT);
  const mountedRef = useRef(false);
  const sortedRows = useMemo(
    () => (summary ? sortBackgroundRows(summary.rows, sort) : []),
    [summary, sort],
  );

  const refresh = useCallback(async () => {
    try {
      const next = await getBackgroundPageSummary();
      if (!mountedRef.current) return;
      setSummary(next);
      setFetchError(false);
    } catch {
      if (mountedRef.current) setFetchError(true);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    const stopPolling = startVisiblePolling(refresh, 5000);
    return () => {
      mountedRef.current = false;
      stopPolling();
    };
  }, [refresh]);

  if (!summary) {
    return (
      <main className="background-page" id="background-content">
        {fetchError ? <div className="warning" role="alert">无法读取后台进程</div>
          : <p role="status" className="empty-state">正在读取后台进程…</p>}
      </main>
    );
  }

  return (
    <main className="background-page" id="background-content">
      {fetchError ? <div className="warning" role="alert">无法读取后台进程</div> : null}

      <section className="panel background-summary" aria-label="后台概况">
        <div className="lcd background-strip">
          {backgroundReadings(summary, durationFormat).map((reading) => (
            <div className="background-reading" key={reading.label}>
              <span>{reading.label}</span>
              <p>
                {splitReading(reading.value).map((part, index) =>
                  part.unit ? <small key={index}>{part.text}</small> : <b key={index}>{part.text}</b>,
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
            <p>内存显示当前占用，已退出的进程显示今日峰值。</p>
          </HelpPopover>
        </header>
        <div className="usage-scroll" role="region" tabIndex={0} aria-label="后台进程明细">
          <table className="background-table">
            <thead>
              <tr>
                {COLUMNS.map((column) => (
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
                <BackgroundRowView key={row.family_key} row={row} durationFormat={durationFormat} />
              ))}
            </tbody>
          </table>
          {summary.rows.length === 0 && (
            <div className="empty-state">今天还没有记录到后台进程。</div>
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
}: {
  row: BackgroundRow;
  durationFormat: DurationFormat;
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
      <td>{row.is_running ? row.process_count : "—"}</td>
      <td>{row.cpu_percent === null ? "—" : formatPercent(row.cpu_percent)}</td>
      <td title={row.is_running ? "当前占用" : "今日峰值"}>{formatBytes(row.memory_bytes)}</td>
      <td>{formatDurationZh(row.today_running_seconds, durationFormat)}</td>
      <td>{formatCpuSeconds(row.today_cpu_seconds, durationFormat)}</td>
      <td>
        <span className={`status-badge ${row.is_running ? "background" : "closed"}`}>
          <i className="lamp" aria-hidden="true" />
          {row.is_running ? "运行中" : "已退出"}
        </span>
      </td>
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
