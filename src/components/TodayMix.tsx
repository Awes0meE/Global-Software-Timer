import type { AppUsageRow } from "../api";
import { formatDurationZh } from "../i18n";
import { UnavailableTooltip } from "./UnavailableTooltip";

interface Props {
  apps: AppUsageRow[];
}

const segmentColors = ["#4c8dff", "#ef5350", "#6ea8ff", "#8e65d7", "#6fc082", "#e2b44f", "#9aa5b1"];

export function TodayMix({ apps }: Props) {
  const rows = apps
    .filter((app) => app.active_today_seconds > 0)
    .sort((left, right) => right.active_today_seconds - left.active_today_seconds);
  const appUsageTotal = rows.reduce((sum, app) => sum + app.active_today_seconds, 0);
  const total = Math.max(0, appUsageTotal);

  return (
    <aside className="panel mix-panel" aria-label="今日分布">
      <div className="panel-heading">
        <h2>今日分布</h2>
        <UnavailableTooltip>
          <button className="ghost-link" type="button" aria-label="查看更多今日分布">
            更多
            <span aria-hidden="true">›</span>
          </button>
        </UnavailableTooltip>
      </div>
      <p className="mix-total">{formatDurationZh(total)}</p>
      <div className="mix-bar" aria-label="今日使用分布条">
        {rows.map((app, index) => (
          <span
            className="mix-segment"
            key={app.app_id}
            style={{
              width: `${appUsageTotal > 0 ? (app.active_today_seconds / appUsageTotal) * 100 : 0}%`,
              backgroundColor: segmentColors[index % segmentColors.length],
            }}
          />
        ))}
      </div>
      <div className="mix-scroll" aria-label="今日分布列表" tabIndex={0}>
        <div className="mix-list">
          {rows.length === 0 ? <div className="empty-state compact">暂无今日分布。</div> : null}
          {rows.map((app, index) => (
            <div key={app.app_id}>
              <span className="mix-name">
                <i style={{ backgroundColor: segmentColors[index % segmentColors.length] }} aria-hidden="true" />
                {app.display_name}
              </span>
              <span>{formatDurationZh(app.active_today_seconds)}</span>
              <strong>
                {appUsageTotal > 0 ? ((app.active_today_seconds / appUsageTotal) * 100).toFixed(1) : "0.0"}%
              </strong>
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
}
