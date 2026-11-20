import { useCallback, useEffect, useRef, useState } from "react";
import {
  getBackgroundPageSummary,
  type BackgroundPageSummary,
  type BackgroundRow,
  type DurationFormat,
} from "../api";
import { formatDurationZh } from "../i18n";
import { startVisiblePolling } from "../visiblePolling";
import { SoftwareIcon } from "./SoftwareIcon";

const emptySummary: BackgroundPageSummary = {
  logical_cores: 1,
  running_count: 0,
  rows: [],
};

interface BackgroundPageProps {
  durationFormat?: DurationFormat;
}

export function BackgroundPage({ durationFormat = "decimal_hours" }: BackgroundPageProps) {
  const [summary, setSummary] = useState<BackgroundPageSummary>(emptySummary);
  const [fetchError, setFetchError] = useState(false);
  const mountedRef = useRef(false);

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

  const running = summary.rows.filter((row) => row.is_running);
  const totalCpu = running.reduce((sum, row) => sum + (row.cpu_percent ?? 0), 0);
  const totalMemory = running.reduce((sum, row) => sum + row.memory_bytes, 0);

  return (
    <main className="background-page" id="background-content">
      {fetchError ? <div className="warning">无法读取后台进程</div> : null}

      <section className="panel background-summary" aria-label="后台概况">
        <div>
          <span>正在后台运行</span>
          <strong>{summary.running_count} 个</strong>
        </div>
        <div>
          <span>当前合计 CPU</span>
          <strong>{formatPercent(totalCpu)}</strong>
        </div>
        <div>
          <span>当前合计内存</span>
          <strong>{formatBytes(totalMemory)}</strong>
        </div>
        <p>
          这里列出没有窗口、也不在托盘里的第三方程序，按今天的 CPU 用量排序。Windows
          系统进程不列出；由你正在使用的软件启动的子进程，算在那个软件名下。
        </p>
      </section>

      <section className="panel table-panel" aria-label="后台进程列表">
        <div className="panel-heading table-heading">
          <h2>后台进程</h2>
        </div>
        <div className="background-row usage-head">
          <span>软件名称</span>
          <span>进程数</span>
          <span>当前 CPU</span>
          <span>内存</span>
          <span>今日后台时长</span>
          <span>今日 CPU 时间</span>
          <span>状态</span>
        </div>
        <div className="usage-scroll">
          {summary.rows.length === 0 ? (
            <div className="empty-state">今天还没有记录到后台进程。</div>
          ) : (
            summary.rows.map((row) => (
              <BackgroundRowView key={row.family_key} row={row} durationFormat={durationFormat} />
            ))
          )}
        </div>
      </section>
    </main>
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
    <div className="background-row">
      <div className="software-cell">
        <SoftwareIcon app={row} />
        <span>
          <strong>{row.display_name}</strong>
          <small>{row.process_name}</small>
        </span>
      </div>
      <span>{row.is_running ? row.process_count : "—"}</span>
      <span>{row.cpu_percent === null ? "—" : formatPercent(row.cpu_percent)}</span>
      <span title={row.is_running ? "当前占用" : "今日峰值"}>{formatBytes(row.memory_bytes)}</span>
      <span>{formatDurationZh(row.today_running_seconds, durationFormat)}</span>
      <span>{formatCpuTime(row.today_cpu_seconds)}</span>
      <span className={`status-badge ${row.is_running ? "background" : "closed"}`}>
        <i aria-hidden="true" />
        {row.is_running ? "运行中" : "已退出"}
      </span>
    </div>
  );
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

/** CPU time is core-seconds: one fully busy core for one second. */
export function formatCpuTime(coreSeconds: number): string {
  const seconds = Number.isFinite(coreSeconds) ? Math.max(0, coreSeconds) : 0;
  if (seconds < 1) return seconds > 0 ? "<1秒" : "0秒";
  if (seconds < 60) return `${Math.round(seconds)}秒`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}分钟`;
  return `${(seconds / 3600).toFixed(1)}小时`;
}
