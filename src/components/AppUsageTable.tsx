import type { AppRuntimeStatus, AppUsageRow, DurationFormat } from "../api";
import { formatDurationZh } from "../i18n";
import { SoftwareIcon } from "./SoftwareIcon";

interface Props {
  apps: AppUsageRow[];
  durationFormat?: DurationFormat;
}

export function AppUsageTable({ apps, durationFormat = "decimal_hours" }: Props) {
  return (
    <section className="panel usage-panel" aria-label="应用时长列表">
      <header className="panel-head">
        <h2>软件使用情况</h2>
        <span className="panel-count">{apps.length} 个软件</span>
      </header>
      <div className="usage-row usage-head" aria-hidden="true">
        <span>软件</span>
        <span>累计</span>
        <span>今天</span>
        <span>状态</span>
      </div>
      <div className="usage-scroll">
        {apps.length === 0 ? (
          <div className="empty-state">
            <strong>还没有记录到软件</strong>
            <span>保持 GST 在托盘运行，打开的软件会自动出现在这里。</span>
          </div>
        ) : (
          apps.map((app) => (
            <div className="usage-row" key={app.app_id}>
              <div className="software-cell">
                <SoftwareIcon app={app} />
                <span>
                  <strong>{app.display_name}</strong>
                  <small>{app.process_name}</small>
                </span>
              </div>
              <span className="num">{formatDurationZh(app.total_seconds, durationFormat)}</span>
              <span className="num">{formatDurationZh(app.today_seconds, durationFormat)}</span>
              <StatusBadge status={app.status} />
            </div>
          ))
        )}
      </div>
    </section>
  );
}

export function StatusBadge({ status }: { status: AppRuntimeStatus }) {
  return (
    <span className={`status-badge ${statusClassName(status)}`}>
      <i className="lamp" aria-hidden="true" />
      {statusLabel(status)}
    </span>
  );
}

function statusLabel(status: AppRuntimeStatus): string {
  if (status === "foreground") {
    return "前台运行";
  }

  if (status === "tray") {
    return "托盘运行";
  }

  if (status === "background") {
    return "后台运行";
  }

  return "未运行";
}

function statusClassName(status: AppRuntimeStatus): string {
  if (status === "foreground") {
    return "running";
  }

  if (status === "tray") {
    return "tray";
  }

  if (status === "background") {
    return "background";
  }

  return "closed";
}
