import type { AppUsageRow } from "../api";
import { SoftwareIcon } from "./SoftwareIcon";
import { UnavailableTooltip } from "./UnavailableTooltip";

interface Props {
  apps: AppUsageRow[];
}

export function RecentActivity({ apps }: Props) {
  const runningApps = apps.filter((app) => app.is_running);

  return (
    <aside className="panel recent-panel" aria-label="当前运行">
      <div className="panel-heading">
        <h2>当前运行</h2>
        <UnavailableTooltip>
          <button className="ghost-link" type="button" aria-label="查看更多当前运行">
            更多
            <span aria-hidden="true">›</span>
          </button>
        </UnavailableTooltip>
      </div>

      <div className="recent-scroll" aria-label="当前运行列表" tabIndex={0}>
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
      </div>
    </aside>
  );
}
