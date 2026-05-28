import type { AppUsageRow } from "../api";

interface Props {
  apps: AppUsageRow[];
}

export function TodayMix({ apps }: Props) {
  const total = apps.reduce((sum, app) => sum + app.today_seconds, 0);
  const top = apps.filter((app) => app.today_seconds > 0).slice(0, 4);

  return (
    <aside className="mix-panel" aria-label="今日分布">
      <h2>今日分布</h2>
      <div className="mix-bar">
        {top.map((app, index) => (
          <span
            className={`mix-segment segment-${index}`}
            key={app.app_id}
            style={{ width: `${total > 0 ? (app.today_seconds / total) * 100 : 0}%` }}
          />
        ))}
      </div>
      <div className="mix-list">
        {top.map((app) => (
          <div key={app.app_id}>
            <span>{app.display_name}</span>
            <strong>{total > 0 ? Math.round((app.today_seconds / total) * 100) : 0}%</strong>
          </div>
        ))}
      </div>
      <p className="muted divider">系统进程和无意义后台进程默认不会显示在仪表盘里。</p>
    </aside>
  );
}
