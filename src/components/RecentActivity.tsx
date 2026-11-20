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
      <header className="panel-head">
        <h2>当前前台运行</h2>
        <span className="panel-count">{runningApps.length}</span>
        <UnavailableTooltip>
          <button className="panel-link" type="button" aria-label="查看更多当前前台运行">
            更多
          </button>
        </UnavailableTooltip>
      </header>

      <div className="recent-scroll" aria-label="当前前台运行列表" tabIndex={0}>
        {runningApps.length === 0 ? (
          <div className="empty-state compact">现在没有打开窗口的软件。</div>
        ) : (
          runningApps.map((app) => (
            <div className="recent-item" key={app.app_id}>
              <i className="lamp is-lit" aria-hidden="true" />
              <SoftwareIcon app={app} size="sm" />
              <strong>{app.display_name}</strong>
              <span className="num">{formatDurationZh(app.today_seconds, durationFormat)}</span>
            </div>
          ))
        )}
      </div>
    </aside>
  );
}
