import type { AppUsageRow, DurationFormat } from "../api";
import { formatDurationZh } from "../i18n";
import { SoftwareIcon } from "./SoftwareIcon";
import { UnavailableTooltip } from "./UnavailableTooltip";

interface Props {
  apps: AppUsageRow[];
  durationFormat?: DurationFormat;
}

export function RecentActivity({ apps, durationFormat = "decimal_hours" }: Props) {
  const runningApps = apps.filter((app) => app.status === "foreground");

  return (
    <aside className="panel recent-panel" aria-label="当前前台运行">
      <div className="panel-heading">
        <h2>当前前台运行</h2>
        <UnavailableTooltip>
          <button className="ghost-link" type="button" aria-label="查看更多当前前台运行">
            更多
            <span aria-hidden="true">›</span>
          </button>
        </UnavailableTooltip>
      </div>

      <div className="recent-scroll" aria-label="当前前台运行列表" tabIndex={0}>
        {runningApps.length === 0 ? (
          <div className="empty-state">暂无前台运行的软件。</div>
        ) : (
          <div className="recent-list">
            {runningApps.map((app) => (
              <div className="recent-item" key={app.app_id}>
                <SoftwareIcon app={app} size="sm" />
                <div className="recent-copy">
                  <strong>{app.display_name}</strong>
                  <span>{app.process_name}</span>
                </div>
                <span className="recent-duration">
                  {formatDurationZh(app.today_seconds, durationFormat)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}
