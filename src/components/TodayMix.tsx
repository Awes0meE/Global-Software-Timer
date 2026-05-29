import type { AppUsageRow } from "../api";
import { formatDurationZh } from "../i18n";

interface Props {
  apps: AppUsageRow[];
}

const segmentColors = ["#4c8dff", "#ef5350", "#6ea8ff", "#8e65d7", "#6fc082", "#e2b44f", "#9aa5b1"];

export function TodayMix({ apps }: Props) {
  const total = apps.reduce((sum, app) => sum + app.today_seconds, 0);
  const top = apps.filter((app) => app.today_seconds > 0).slice(0, 6);
  const shownTotal = top.reduce((sum, app) => sum + app.today_seconds, 0);
  const otherSeconds = Math.max(0, total - shownTotal);
  const rows = otherSeconds > 0
    ? [...top, createOtherUsageRow(otherSeconds)]
    : top;

  return (
    <aside className="panel mix-panel" aria-label="今日分布">
      <div className="panel-heading">
        <h2>今日分布</h2>
        <button className="ghost-link" type="button" aria-label="查看更多今日分布" disabled>
          更多
          <span aria-hidden="true">›</span>
        </button>
      </div>
      <p className="mix-total">{formatDurationZh(total)}</p>
      <div className="mix-bar" aria-label="今日使用分布条">
        {rows.map((app, index) => (
          <span
            className="mix-segment"
            key={app.app_id}
            style={{
              width: `${total > 0 ? (app.today_seconds / total) * 100 : 0}%`,
              backgroundColor: segmentColors[index % segmentColors.length],
            }}
          />
        ))}
      </div>
      <div className="mix-list">
        {rows.length === 0 ? <div className="empty-state compact">暂无今日分布。</div> : null}
        {rows.map((app, index) => (
          <div key={app.app_id}>
            <span className="mix-name">
              <i style={{ backgroundColor: segmentColors[index % segmentColors.length] }} aria-hidden="true" />
              {app.display_name}
            </span>
            <span>{formatDurationZh(app.today_seconds)}</span>
            <strong>{total > 0 ? ((app.today_seconds / total) * 100).toFixed(1) : "0.0"}%</strong>
          </div>
        ))}
      </div>
    </aside>
  );
}

function createOtherUsageRow(todaySeconds: number): AppUsageRow {
  return {
    app_id: -1,
    display_name: "其他",
    process_name: "other",
    total_seconds: todaySeconds,
    today_seconds: todaySeconds,
    is_running: false,
  };
}
