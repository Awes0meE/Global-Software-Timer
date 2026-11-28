import type { AppRuntimeStatus, AppUsageRow, DurationFormat } from "../api";
import { formatDurationZh, runtimeStatusLabelZh } from "../i18n";
import { SoftwareIcon } from "./SoftwareIcon";

interface Props {
  apps: AppUsageRow[];
  durationFormat?: DurationFormat;
  /** The apps are a past day's: nothing runs, so 今天 reads 当日 and the status column is 当日活跃. */
  pastDay?: boolean;
}

export function AppUsageTable({ apps, durationFormat = "decimal_hours", pastDay = false }: Props) {
  const rowClass = `usage-row${pastDay ? " is-past" : ""}`;

  return (
    <section className="panel usage-panel" aria-label="应用时长列表">
      <header className="panel-head">
        <h2>软件使用情况</h2>
        <span className="panel-count">{apps.length} 个软件</span>
      </header>
      <div className={`${rowClass} usage-head`} aria-hidden="true">
        <span>软件</span>
        <span>累计</span>
        <span>{pastDay ? "当日" : "今天"}</span>
        <span>{pastDay ? "当日活跃" : "状态"}</span>
      </div>
      <div className="usage-scroll" role="region" tabIndex={0} aria-label="软件使用明细">
        {apps.length === 0 ? (
          pastDay ? (
            <div className="empty-state">
              <strong>这一天没有记录到软件</strong>
            </div>
          ) : (
            <div className="empty-state">
              <strong>还没有记录到软件</strong>
            </div>
          )
        ) : (
          apps.map((app) => (
            <div className={rowClass} key={app.app_id}>
              <div className="software-cell">
                <SoftwareIcon app={app} />
                <span>
                  <strong>{app.display_name}</strong>
                  <small>{app.process_name}</small>
                </span>
              </div>
              <span className="num">{formatDurationZh(app.total_seconds, durationFormat)}</span>
              <span className="num">{formatDurationZh(app.today_seconds, durationFormat)}</span>
              {pastDay ? (
                <span className="num">{formatDurationZh(app.active_today_seconds, durationFormat)}</span>
              ) : (
                <StatusBadge status={app.status} />
              )}
            </div>
          ))
        )}
      </div>
    </section>
  );
}

export function StatusBadge({ status, compact = false }: { status: AppRuntimeStatus; compact?: boolean }) {
  const label = runtimeStatusLabelZh(status);
  if (compact) {
    return (
      <span className={`status-badge ${statusClassName(status)}`} role="img" aria-label={label} title={label}>
        <i className="lamp" aria-hidden="true" />
      </span>
    );
  }
  return (
    <span className={`status-badge ${statusClassName(status)}`}>
      <i className="lamp" aria-hidden="true" />
      {label}
    </span>
  );
}

function statusClassName(status: AppRuntimeStatus): string {
  if (status === "foreground") {
    return "running";
  }

  // A tray icon is one kind of background run: both read 后台运行 under one lamp (v0.4.9).
  if (status === "tray" || status === "background") {
    return "background";
  }

  return "closed";
}
