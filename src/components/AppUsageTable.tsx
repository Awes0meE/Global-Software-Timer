import type { AppUsageRow } from "../api";
import { formatDurationZh } from "../i18n";

interface Props {
  apps: AppUsageRow[];
}

export function AppUsageTable({ apps }: Props) {
  return (
    <section className="table-panel" aria-label="应用时长列表">
      <div className="usage-row usage-head">
        <span>应用</span>
        <span>累计</span>
        <span>今天</span>
        <span>状态</span>
      </div>
      {apps.length === 0 ? (
        <div className="empty-state">暂时没有可展示的软件时长。</div>
      ) : (
        apps.map((app) => (
          <div className="usage-row" key={app.app_id}>
            <span>
              <strong>{app.display_name}</strong>
              <small>{app.process_name}</small>
            </span>
            <span>{formatDurationZh(app.total_seconds)}</span>
            <span>{formatDurationZh(app.today_seconds)}</span>
            <span className={app.is_running ? "running" : "closed"}>
              {app.is_running ? "运行中" : "已关闭"}
            </span>
          </div>
        ))
      )}
    </section>
  );
}
