import type { CSSProperties } from "react";
import type { AppUsageRow, DurationFormat } from "../api";
import { formatDurationZh } from "../i18n";

interface Props {
  apps: AppUsageRow[];
  durationFormat?: DurationFormat;
  /** The apps are a past day's: 今日分布 reads 当日分布. */
  pastDay?: boolean;
}

const MIX_COLORS = 7;

/** The identity colour's number, 1 to MIX_COLORS, cycling down the list. */
function mixNumber(index: number): number {
  return (index % MIX_COLORS) + 1;
}

function mixColor(index: number): string {
  return `var(--mix-${mixNumber(index)})`;
}

/**
 * Each software's share of the day's foreground active time. No total (v0.4.7): the sum covers only time spent
 * in software GST lists, so it fell short of 今日活跃 (GST's own window, the desktop and hidden software are left
 * out) and read as a second, contradicting total.
 */
export function TodayMix({ apps, durationFormat = "decimal_hours", pastDay = false }: Props) {
  const rows = apps
    .filter((app) => app.active_today_seconds > 0)
    .sort((left, right) => right.active_today_seconds - left.active_today_seconds);
  const total = rows.reduce((sum, app) => sum + app.active_today_seconds, 0);
  const share = (seconds: number) => (total > 0 ? (seconds / total) * 100 : 0);
  const day = pastDay ? "当日" : "今日";

  return (
    <aside className="panel mix-panel" aria-label={`${day}分布`}>
      <header className="panel-head">
        <h2>{day}分布</h2>
      </header>
      <div className="mix-plate">
        <div className="mix-bar" aria-label={`${day}使用分布条`}>
          {rows.map((app, index) => {
            const color = mixColor(index);
            return (
              <span
                className="mix-segment"
                key={app.app_id}
                data-mix={mixNumber(index)}
                style={
                  {
                    width: `${share(app.active_today_seconds)}%`,
                    backgroundColor: color,
                    "--mix-color": color,
                  } as CSSProperties
                }
              />
            );
          })}
        </div>
        <div className="mix-scroll" role="region" aria-label={`${day}分布列表`} tabIndex={0}>
          {rows.length === 0 ? (
            <div className="empty-state compact">{pastDay ? "这一天没有活跃记录。" : "今天还没有活跃记录。"}</div>
          ) : null}
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
