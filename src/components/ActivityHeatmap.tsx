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
/** Months per row before the normal-size dot matrices wrap; 近一年 switches to small cells, seven a row. */
const MONTHS_PER_ROW = 4;
const COMPACT_MIN_DAYS = 200;

export function heatLevel(activeSeconds: number, thresholdSeconds: number): HeatLevel {
  if (activeSeconds < thresholdSeconds) return 0;
  if (activeSeconds < LEVEL_1_MAX_SECONDS) return 1;
  if (activeSeconds < LEVEL_2_MAX_SECONDS) return 2;
  return 3;
}

type Cell =
  | { kind: "blank" }
  | { kind: "future" }
  | { kind: "outside"; date: string }
  | { kind: "norecord"; date: string }
  | { kind: "day"; day: HeatmapDay; level: HeatLevel; isToday: boolean };

interface MonthBlock {
  key: string;
  label: string;
  cells: Cell[];
  recorded: boolean;
  usedDays: number;
  activeSeconds: number;
}

/** Accepts a first-record date once the summary reports one; until then it is inferred. */
type HeatmapSummary = AchievementsSummary & { data_start_date?: string | null };

/**
 * The first day with local records, or null when nothing has been recorded yet. Days before it
 * are 无记录, not 没用. The summary zero-fills the heatmap, so without `data_start_date` the zero
 * days that open the range count as 无记录, unless a streak, record, milestone or software date
 * shows history from before the range.
 */
export function recordStartDate(summary: HeatmapSummary): string | null {
  if (summary.data_start_date !== undefined) return summary.data_start_date;
  const rangeStart = summary.heatmap[0]?.date ?? summary.today;
  const known = [
    summary.longest_streak_start,
    summary.best_active_day?.date,
    summary.best_software_day?.date,
    ...summary.milestones.map((row) => row.reached_on),
    ...summary.new_software.map((row) => row.date),
    ...summary.dormant_software.map((row) => row.date),
    summary.heatmap.find((day) => day.active_seconds > 0)?.date,
  ].filter((date): date is string => Boolean(date));
  if (known.length === 0) return null;
  const earliest = known.reduce((min, date) => (date < min ? date : min));
  return earliest < rangeStart ? rangeStart : earliest;
}

interface Props {
  summary: AchievementsSummary;
  durationFormat: DurationFormat;
}

export function ActivityHeatmap({ summary, durationFormat }: Props) {
  const { heatmap, today, streak_threshold_seconds: threshold } = summary;
  const rangeLabel = HEATMAP_RANGE_LABELS[summary.heatmap_days as HeatmapDays] ?? `近 ${heatmap.length} 天`;
  const recordStart = recordStartDate(summary);
  const isRecorded = (date: string) => recordStart !== null && date >= recordStart;
  const months = buildMonths(heatmap, today, threshold, isRecorded);
  const usedDays = heatmap.filter((day) => isRecorded(day.date) && day.active_seconds >= threshold).length;
  const activeTotal = heatmap.reduce((sum, day) => sum + day.active_seconds, 0);
  const hasNoRecordDays = heatmap.some((day) => !isRecorded(day.date));
  const compact = heatmap.length > COMPACT_MIN_DAYS;
  const rows = Math.max(Math.ceil(months.length / MONTHS_PER_ROW), 1);
  const perRow = compact ? 7 : Math.max(Math.ceil(months.length / rows), 1);
  const start = heatmap[0]?.date ?? today;
  const end = heatmap[heatmap.length - 1]?.date ?? today;
  const recordNote = !hasNoRecordDays ? "" : recordStart === null ? "，还没有记录" : `，${recordStart} 之前无记录`;
  const chartLabel = `${rangeLabel}活跃热力图：${start} 至 ${end}，用过 ${usedDays} 天，活跃 ${formatDurationZh(activeTotal, durationFormat)}${recordNote}`;

  return (
    <>
      <div className={`lcd ach-dial${compact ? " is-compact" : ""}`}>
        <div className="ach-months" role="img" aria-label={chartLabel} style={{ "--ach-per-row": perRow } as CSSProperties}>
          {months.map((month, index) => {
            const usedCaption = `用过 ${month.usedDays} 天`;
            const durationCaption = formatDurationZh(month.activeSeconds, durationFormat);
            const caption = `${usedCaption} · ${durationCaption}`;
            const classes = ["ach-month"];
            if (index % perRow === 0) classes.push("is-row-start");
            if (index >= perRow) classes.push("is-wrapped");
            return (
              <div
                className={classes.join(" ")}
                key={month.key}
                title={month.recorded ? `${month.key} ${caption}` : `${month.key} 无记录`}
              >
                <div className="ach-month-head">
                  <b>{month.label}</b>
                  {month.recorded ? (
                    <span className="lcd-note">
                      {/* Two unbreakable parts; the CSS separator in front of a part that starts a line is clipped. */}
                      <span className="ach-month-caption">
                        <span>{usedCaption}</span>
                        {compact ? null : <span>{durationCaption}</span>}
                      </span>
                    </span>
                  ) : null}
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
          <div className="ach-legend" aria-hidden="true">
            <span><i className="ach-cell l0" />没用</span>
            <span><i className="ach-cell l1" />&lt;1小时</span>
            <span><i className="ach-cell l2" />&lt;3小时</span>
            <span><i className="ach-cell l3" />≥3小时</span>
            <span><i className="ach-cell is-future" />未到</span>
            {hasNoRecordDays ? <span><i className="ach-cell is-norecord" />无记录</span> : null}
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
              <td>{!isRecorded(day.date) ? "无记录" : day.active_seconds >= threshold ? "用过" : "没用"}</td>
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
  if (cell.kind === "outside") return <i className="ach-cell is-outside" title={`${cell.date} 不在范围内`} />;
  if (cell.kind === "norecord") {
    const label = `${cell.date} 无记录`;
    return <i className="ach-cell is-norecord" aria-label={label} title={label} />;
  }
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

function buildMonths(
  heatmap: HeatmapDay[],
  today: string,
  threshold: number,
  isRecorded: (date: string) => boolean,
): MonthBlock[] {
  const byDate = new Map(heatmap.map((day) => [day.date, day]));
  const keys = [...new Set(heatmap.map((day) => day.date.slice(0, 7)))];
  const lastYear = Number(keys[keys.length - 1]?.slice(0, 4));

  return keys.map((key, index) => {
    const year = Number(key.slice(0, 4));
    const month = Number(key.slice(5, 7));
    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const mondayOffset = (new Date(Date.UTC(year, month - 1, 1)).getUTCDay() + 6) % 7;
    const cells: Cell[] = Array.from({ length: mondayOffset }, () => ({ kind: "blank" }));
    let recorded = false;
    let usedDays = 0;
    let activeSeconds = 0;

    for (let dayOfMonth = 1; dayOfMonth <= daysInMonth; dayOfMonth += 1) {
      const date = `${key}-${String(dayOfMonth).padStart(2, "0")}`;
      const day = byDate.get(date);
      if (day && !isRecorded(date)) {
        cells.push({ kind: "norecord", date });
      } else if (day) {
        recorded = true;
        const level = heatLevel(day.active_seconds, threshold);
        if (day.active_seconds >= threshold) usedDays += 1;
        activeSeconds += day.active_seconds;
        cells.push({ kind: "day", day, level, isToday: date === today });
      } else {
        // Every month keeps its whole calendar shape: days before the range are faint placeholders.
        cells.push(date > today ? { kind: "future" } : { kind: "outside", date });
      }
    }

    const withYear = (month === 1 && index > 0) || (index === 0 && year !== lastYear);
    return {
      key,
      label: withYear ? `${String(year % 100).padStart(2, "0")}年${month}月` : `${month}月`,
      cells,
      recorded,
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
