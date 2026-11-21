import type { CSSProperties } from "react";
import type { AchievementsSummary, DurationFormat, HeatmapDay, HeatmapDays } from "../api";
import { formatDurationPartsZh, formatDurationZh } from "../i18n";

export const HEATMAP_RANGE_LABELS: Record<HeatmapDays, string> = {
  90: "近 90 天",
  180: "近半年",
  365: "近一年",
};

/** 0 = 没用 (below the streak filter), 1 = <1 小时, 2 = <3 小时, 3 = ≥3 小时. */
export type HeatLevel = 0 | 1 | 2 | 3;

const LEVEL_1_MAX_SECONDS = 3600;
const LEVEL_2_MAX_SECONDS = 3 * 3600;
const WEEKDAYS = ["一", "二", "三", "四", "五", "六", "日"];

export function heatLevel(activeSeconds: number, thresholdSeconds: number): HeatLevel {
  if (activeSeconds < thresholdSeconds) return 0;
  if (activeSeconds < LEVEL_1_MAX_SECONDS) return 1;
  if (activeSeconds < LEVEL_2_MAX_SECONDS) return 2;
  return 3;
}

type Cell =
  | { kind: "blank" }
  | { kind: "future" }
  | { kind: "day"; day: HeatmapDay; level: HeatLevel; isToday: boolean };

interface MonthBlock {
  key: string;
  label: string;
  cells: Cell[];
  usedDays: number;
  activeSeconds: number;
}

interface Props {
  summary: AchievementsSummary;
  durationFormat: DurationFormat;
}

export function ActivityHeatmap({ summary, durationFormat }: Props) {
  const { heatmap, today, streak_threshold_seconds: threshold } = summary;
  const rangeLabel = HEATMAP_RANGE_LABELS[summary.heatmap_days as HeatmapDays] ?? `近 ${heatmap.length} 天`;
  const months = buildMonths(heatmap, today, threshold);
  const usedDays = heatmap.filter((day) => day.active_seconds >= threshold).length;
  const activeTotal = heatmap.reduce((sum, day) => sum + day.active_seconds, 0);
  const compact = heatmap.length > 120;
  const perRow = compact ? 7 : Math.max(months.length, 1);
  const thresholdMinutes = Math.round(threshold / 60);
  const start = heatmap[0]?.date ?? today;
  const end = heatmap[heatmap.length - 1]?.date ?? today;
  const chartLabel = `${rangeLabel}活跃热力图：${start} 至 ${end}，用过 ${usedDays} 天，活跃 ${formatDurationZh(activeTotal, durationFormat)}`;

  return (
    <>
      <div className={`lcd ach-dial${compact ? " is-compact" : ""}`}>
        <div className="ach-months" role="img" aria-label={chartLabel} style={{ "--ach-per-row": perRow } as CSSProperties}>
          {months.map((month, index) => {
            const caption = `用过 ${month.usedDays} 天 · ${formatDurationZh(month.activeSeconds, durationFormat)}`;
            const classes = ["ach-month"];
            if (index % perRow === 0) classes.push("is-row-start");
            if (index >= perRow) classes.push("is-wrapped");
            return (
              <div className={classes.join(" ")} key={month.key} title={`${month.key} ${caption}`}>
                <div className="ach-month-head">
                  <b>{month.label}</b>
                  <span className="lcd-note">{compact ? `用过 ${month.usedDays} 天` : caption}</span>
                </div>
                <div className="ach-month-grid">
                  {compact ? null : WEEKDAYS.map((weekday) => <span className="ach-weekday" key={weekday}>{weekday}</span>)}
                  {month.cells.map((cell, cellIndex) => <HeatCell key={cellIndex} cell={cell} durationFormat={durationFormat} />)}
                </div>
              </div>
            );
          })}
        </div>

        <div className="ach-readings">
          <div className="ach-pair">
            <div className="lcd-cell">
              <span className="lcd-label">当前连续</span>
              <p className="lcd-value"><b>{summary.current_streak_days}</b><small>天</small></p>
              <span className="lcd-note">
                {streakNote(summary.current_streak_start, summary.current_streak_days, today)}
              </span>
            </div>
            <div className="lcd-cell">
              <span className="lcd-label">最长连续</span>
              <p className="lcd-value"><b>{summary.longest_streak_days}</b><small>天</small></p>
              <span className="lcd-note">
                {streakNote(summary.longest_streak_start, summary.longest_streak_days, today)}
              </span>
            </div>
          </div>
          <div className="ach-pair ach-rule-top">
            <div className="lcd-cell">
              <span className="lcd-label">{rangeLabel}里用过</span>
              <p className="ach-dial-stat">{usedDays}<small>天</small></p>
            </div>
            <div className="lcd-cell">
              <span className="lcd-label">{rangeLabel}活跃</span>
              <p className="ach-dial-stat">
                {formatDurationPartsZh(activeTotal, durationFormat).map((part) => (
                  <span key={part.unit}>{part.value}<small>{part.unit}</small></span>
                ))}
              </p>
            </div>
          </div>
          <div className="ach-caption ach-rule-top">
            <span className="lcd-note">
              <span>活跃不到 {thresholdMinutes} 分钟的日子不算在内，</span>
              <span>免得开机看一眼也被记上</span>
            </span>
            <div className="ach-legend" aria-hidden="true">
              <span><i className="ach-cell l0" />没用</span>
              <span><i className="ach-cell l1" />&lt;1小时</span>
              <span><i className="ach-cell l2" />&lt;3小时</span>
              <span><i className="ach-cell l3" />≥3小时</span>
              <span><i className="ach-cell is-future" />未到</span>
            </div>
          </div>
        </div>
      </div>

      <table className="ach-sr-only">
        <caption>{rangeLabel}逐日活跃</caption>
        <thead>
          <tr>
            <th scope="col">日期</th>
            <th scope="col">活跃</th>
            <th scope="col">记录</th>
          </tr>
        </thead>
        <tbody>
          {heatmap.map((day) => (
            <tr key={day.date}>
              <th scope="row">{day.date}</th>
              <td>{formatDurationZh(day.active_seconds, durationFormat)}</td>
              <td>{day.active_seconds >= threshold ? "用过" : "没用"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

function HeatCell({ cell, durationFormat }: { cell: Cell; durationFormat: DurationFormat }) {
  if (cell.kind === "blank") return <i className="ach-cell is-blank" />;
  if (cell.kind === "future") return <i className="ach-cell is-future" />;
  const label = `${cell.day.date} 活跃 ${formatDurationZh(cell.day.active_seconds, durationFormat)}`;
  return (
    <i
      className={`ach-cell l${cell.level}${cell.isToday ? " is-today" : ""}`}
      data-level={cell.level}
      aria-label={label}
      title={label}
    />
  );
}

function buildMonths(heatmap: HeatmapDay[], today: string, threshold: number): MonthBlock[] {
  const byDate = new Map(heatmap.map((day) => [day.date, day]));
  const keys = [...new Set(heatmap.map((day) => day.date.slice(0, 7)))];
  const lastYear = Number(keys[keys.length - 1]?.slice(0, 4));

  return keys.map((key, index) => {
    const year = Number(key.slice(0, 4));
    const month = Number(key.slice(5, 7));
    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const mondayOffset = (new Date(Date.UTC(year, month - 1, 1)).getUTCDay() + 6) % 7;
    const cells: Cell[] = Array.from({ length: mondayOffset }, () => ({ kind: "blank" }));
    let usedDays = 0;
    let activeSeconds = 0;

    for (let dayOfMonth = 1; dayOfMonth <= daysInMonth; dayOfMonth += 1) {
      const date = `${key}-${String(dayOfMonth).padStart(2, "0")}`;
      const day = byDate.get(date);
      if (day) {
        const level = heatLevel(day.active_seconds, threshold);
        if (day.active_seconds >= threshold) usedDays += 1;
        activeSeconds += day.active_seconds;
        cells.push({ kind: "day", day, level, isToday: date === today });
      } else {
        cells.push({ kind: date > today ? "future" : "blank" });
      }
    }

    // A month cut by the range start should not open with empty weeks.
    let firstRow = 0;
    while (firstRow + 7 <= cells.length && cells.slice(firstRow, firstRow + 7).every((cell) => cell.kind === "blank")) {
      firstRow += 7;
    }

    const withYear = (month === 1 && index > 0) || (index === 0 && year !== lastYear);
    return {
      key,
      label: withYear ? `${String(year % 100).padStart(2, "0")}年${month}月` : `${month}月`,
      cells: cells.slice(firstRow),
      usedDays,
      activeSeconds,
    };
  });
}

function streakNote(start: string | null, days: number, today: string): string {
  if (!start || days <= 0) return "—";
  const end = addDays(start, days - 1);
  const year = today.slice(0, 4);
  const short = (date: string) => (date.slice(0, 4) === year ? date.slice(5) : date);
  return end === today ? `${short(start)} 至今天` : `${short(start)} 至 ${short(end)}`;
}

function addDays(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}
