import type { AppUsageRow } from "../api";
import { SoftwareIcon } from "./SoftwareIcon";

interface Props {
  apps: AppUsageRow[];
}

export function RecentActivity({ apps }: Props) {
  const runningApps = apps.filter((app) => app.is_running).slice(0, 5);

  return (
    <aside className="panel recent-panel" aria-label="当前运行">
      <div className="panel-heading">
        <h2>当前运行</h2>
        <button className="ghost-link" type="button" aria-label="查看更多当前运行" disabled>
          更多
          <span aria-hidden="true">›</span>
        </button>
      </div>

      {runningApps.length === 0 ? (
        <div className="empty-state">暂无运行中的软件。</div>
      ) : (
        <div className="recent-list">
          {runningApps.map((app) => (
            <div className="recent-item" key={app.app_id}>
              <SoftwareIcon app={app} size="sm" />
              <div className="recent-copy">
                <strong>{app.display_name}</strong>
                <span>{app.process_name}</span>
              </div>
              <span className="recent-state">运行中</span>
            </div>
          ))}
        </div>
      )}
    </aside>
  );
}
