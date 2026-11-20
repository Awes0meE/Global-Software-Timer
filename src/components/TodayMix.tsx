import type { AppUsageRow, DurationFormat } from "../api";
import { formatDurationZh } from "../i18n";
import { UnavailableTooltip } from "./UnavailableTooltip";

interface Props {
  apps: AppUsageRow[];
  durationFormat?: DurationFormat;
}

const MIX_COLORS = 7;

function mixColor(index: number): string {
  return `var(--mix-${(index % MIX_COLORS) + 1})`;
}

export function TodayMix({ apps, durationFormat = "decimal_hours" }: Props) {
  const rows = apps
    .filter((app) => app.active_today_seconds > 0)
    .sort((left, right) => right.active_today_seconds - left.active_today_seconds);
  const total = rows.reduce((sum, app) => sum + app.active_today_seconds, 0);
  const share = (seconds: number) => (total > 0 ? (seconds / total) * 100 : 0);

  return (
    <aside className="panel mix-panel" aria-label="今日分布">
      <header className="panel-head">
        <h2>今日分布</h2>
        <UnavailableTooltip>
          <button className="panel-link" type="button" aria-label="查看更多今日分布">
            更多
          </button>
        </UnavailableTooltip>
      </header>
      <p className="mix-total num">{formatDurationZh(total, durationFormat)}</p>
      <p className="mix-caption">今日活跃时间按前台软件拆分</p>
      <div className="mix-plate">
        <div className="mix-bar" aria-label="今日使用分布条">
          {rows.map((app, index) => (
            <span
              className="mix-segment"
              key={app.app_id}
              style={{ width: `${share(app.active_today_seconds)}%`, backgroundColor: mixColor(index) }}
            />
          ))}
        </div>
        <div className="mix-scroll" aria-label="今日分布列表" tabIndex={0}>
          {rows.length === 0 ? <div className="empty-state compact">今天还没有活跃记录。</div> : null}
          {rows.map((app, index) => (
            <div className="mix-row" key={app.app_id}>
              <i style={{ backgroundColor: mixColor(index) }} aria-hidden="true" />
              <span className="mix-name">{app.display_name}</span>
              <span className="num">{formatDurationZh(app.active_today_seconds, durationFormat)}</span>
              <strong className="num">{share(app.active_today_seconds).toFixed(1)}%</strong>
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
}
