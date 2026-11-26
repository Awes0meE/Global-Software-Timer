import { useLayoutEffect, useRef, useState, type MouseEvent } from "react";
import type { DurationFormat, StatisticsDay, StatisticsSummary } from "../api";
import { formatDurationZh } from "../i18n";
import { percentChange } from "../statisticsRange";
import { useWeekStart, type WeekStart } from "../weekStart";
import { Duration, localDate } from "./StatisticsLedgers";

interface Props {
  summary: StatisticsSummary;
  durationFormat: DurationFormat;
  /** Local `YYYY-MM-DD`; marks today's needle and the recording head. */
  today: string;
}

type Density = "small" | "mid" | "dense";
/**
 * How a short range labels its days, tried in order until the labels fit side by side:
 * full (`11-17 周二` over `活跃 6.8小时` and `记录 22.4小时`), short (the values without their
 * prefixes, which move to the left gutter) and dates (the day line alone, values in the hover card).
 */
type LabelStyle = "full" | "short" | "dates";
const LABEL_STYLES: LabelStyle[] = ["full", "short", "dates"];

const WEEKDAYS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
const PLOT_LEFT = 52;
const PLOT_RIGHT_GUTTER = 54;
const PLOT_TOP = 12;
const PLOT_BOTTOM = 162;
const TIP_WIDTH = 150;
/** Today's lamp sits left of its label: 8px offset plus a 3.5px radius. */
const LAMP_REACH = 11.5;
/** Under sparse labels the lamp sits 9px left of the end-anchored 今天 label, radius 3.5px. */
const END_LAMP_REACH = 12.5;
/** Least free space between two neighbouring per-day labels. */
const LABEL_GAP = 8;

/**
 * 走纸记录仪: one needle per day on a paper strip (recorded light, active dark),
 * the active ratio as a thin trace and the daily average active time as a dashed rule.
 * Up to 10 days every day is labelled, with its values when they fit side by side in their
 * columns (see LabelStyle). Longer ranges, or a short one too narrow for even the day line,
 * label the first day of each week (≤ 40 days, following 每周起始日) or months; a day without values on the paper shows them in a hover card.
 */
export function TrendRecorder({ summary, durationFormat, today }: Props) {
  const { days } = summary;
  const recorded = sum(days, "recorded_seconds");
  const active = sum(days, "active_seconds");
  const averageActive = summary.days_count > 0 ? active / summary.days_count : 0;
  const density: Density = days.length <= 10 ? "small" : days.length <= 40 ? "mid" : "dense";
  const format = (seconds: number) => formatDurationZh(seconds, durationFormat);
  const chartLabel =
    `每日趋势：${summary.start} 至 ${summary.end}，共 ${summary.days_count} 天，` +
    `记录 ${format(recorded)}，活跃 ${format(active)}，日均活跃 ${format(averageActive)}，` +
    `活跃率 ${formatRatio(active, recorded)}`;

  return (
    <section className="panel stats-panel trend-panel" aria-labelledby="stats-trend-title">
      <header className="panel-head">
        <h2 id="stats-trend-title">每日趋势</h2>
        <span className="trend-legend">
          <span>
            <i className="key-rec" aria-hidden="true" />
            记录
          </span>
          <span>
            <i className="key-act" aria-hidden="true" />
            活跃
          </span>
          <span>
            <i className="key-trace" aria-hidden="true" />
            {density === "dense" ? "活跃率（按周）" : "活跃率"}
          </span>
          <span>
            <i className="key-avg" aria-hidden="true" />
            日均活跃 <b className="num">{format(averageActive)}</b>
          </span>
          {density === "dense" ? null : (
            <span>
              <i className="key-gap" aria-hidden="true" />
              无记录
            </span>
          )}
        </span>
        <span className="trend-sums">
          <span className="trend-sum">
            <span>记录</span>
            <b className="num">
              <Duration seconds={recorded} format={durationFormat} />
            </b>
            <em className="num">
              {changeText(summary.system_comparison_available, recorded, summary.previous_recorded_seconds)}
            </em>
          </span>
          <span className="trend-sum">
            <span>活跃</span>
            <b className="num">
              <Duration seconds={active} format={durationFormat} />
            </b>
            <em className="num">
              {changeText(summary.system_comparison_available, active, summary.previous_active_seconds)}
            </em>
          </span>
          <span className="trend-sum">
            <span>活跃率</span>
            <b className="num">{formatRatio(active, recorded)}</b>
          </span>
        </span>
      </header>
      <RecorderPaper
        days={days}
        rangeDensity={density}
        averageActive={averageActive}
        today={today}
        durationFormat={durationFormat}
        label={chartLabel}
      />
      <table className="stats-sr">
        <caption>逐日记录与活跃</caption>
        <thead>
          <tr>
            <th scope="col">日期</th>
            <th scope="col">记录</th>
            <th scope="col">活跃</th>
            <th scope="col">活跃率</th>
          </tr>
        </thead>
        <tbody>
          {days.map((day) => (
            <tr key={day.date}>
              <th scope="row">{day.date}</th>
              <td>{format(day.recorded_seconds)}</td>
              <td>{format(day.active_seconds)}</td>
              <td>{formatRatio(day.active_seconds, day.recorded_seconds)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function RecorderPaper({
  days,
  rangeDensity,
  averageActive,
  today,
  durationFormat,
  label,
}: {
  days: StatisticsDay[];
  rangeDensity: Density;
  averageActive: number;
  today: string;
  durationFormat: DurationFormat;
  label: string;
}) {
  const paperRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(1080);
  const [hover, setHover] = useState<number | null>(null);
  const weekStart = useWeekStart();

  useLayoutEffect(() => {
    const paper = paperRef.current;
    if (!paper || typeof ResizeObserver === "undefined") return;
    const measure = () => {
      if (paper.clientWidth > 0) setWidth(Math.max(480, Math.floor(paper.clientWidth)));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(paper);
    return () => observer.disconnect();
  }, []);

  const n = days.length;
  const left = PLOT_LEFT;
  const right = width - PLOT_RIGHT_GUTTER;
  const top = PLOT_TOP;
  const bottom = PLOT_BOTTOM;
  const columnWidth = (right - left) / Math.max(1, n);
  const format = (seconds: number) => formatDurationZh(seconds, durationFormat);
  // Per-day labels need room: a narrow window or long hours-minutes values shorten them first.
  const labelStyle =
    rangeDensity === "small"
      ? (LABEL_STYLES.find((style) => dayLabelsFit(days, style, columnWidth, today, format)) ?? null)
      : null;
  const density: Density = rangeDensity === "small" && labelStyle === null ? "mid" : rangeDensity;
  const valuesShown = labelStyle === "full" || labelStyle === "short";
  const height = valuesShown ? 226 : labelStyle === "dates" ? 190 : 186;
  const yHours = (seconds: number) => bottom - (Math.min(seconds, 86400) / 86400) * (bottom - top);
  const ratioPoints = density === "dense" ? weeklyRatios(days) : dailyRatios(days);
  const ratioTop = Math.max(0, ...ratioPoints.flat().map((point) => point.ratio)) <= 0.5 ? 0.5 : 1;
  const yRatio = (ratio: number) => bottom - (Math.min(ratio, ratioTop) / ratioTop) * (bottom - top);
  const needleWidth = density === "small" ? 18 : density === "mid" ? 12 : Math.max(columnWidth - 1.4, 1);
  const labels = density === "small" ? new Map<number, string>() : sparseLabels(days, density, today, columnWidth, weekStart);
  const lastDay = days[n - 1];
  const endsToday = lastDay?.date === today;
  const dayBoundaries =
    density === "dense"
      ? [0, ...days.flatMap((day, index) => (index > 0 && day.date.endsWith("-01") ? [index] : [])), n]
      : Array.from({ length: n + 1 }, (_, index) => index);
  const averageY = yHours(averageActive);

  const onMove = (event: MouseEvent<SVGSVGElement>) => {
    if (valuesShown) return;
    const box = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - box.left) / Math.max(1, box.width)) * width;
    const index = Math.floor((x - left) / columnWidth);
    setHover(index >= 0 && index < n ? index : null);
  };

  const hoverDay = hover === null ? null : days[hover];
  const tipLeft =
    hover === null
      ? 0
      : left + (hover + 1) * columnWidth + 10 + TIP_WIDTH > width
        ? left + hover * columnWidth - 10 - TIP_WIDTH
        : left + (hover + 1) * columnWidth + 10;

  return (
    <div className="recorder">
      <div className="paper" ref={paperRef} style={{ height }}>
        <svg
          className="recorder-svg"
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={label}
          onMouseMove={onMove}
          onMouseLeave={() => setHover(null)}
        >
          {hover !== null ? (
            <rect className="hover-band" x={left + hover * columnWidth} y={top} width={columnWidth} height={bottom - top} />
          ) : null}
          {[0, 3, 6, 9, 12, 15, 18, 21, 24].map((hour) => (
            <line
              key={`rule-${hour}`}
              className={hour % 6 === 0 ? "rule-major" : "rule-minor"}
              x1={left}
              x2={right}
              y1={yHours(hour * 3600)}
              y2={yHours(hour * 3600)}
            />
          ))}
          {[0, 6, 12, 18, 24].map((hour) => (
            <text key={`hour-${hour}`} className="scale" x={left - 9} y={yHours(hour * 3600) + 4} textAnchor="end">
              {hour}h
            </text>
          ))}
          {[0, ratioTop / 2, ratioTop].map((ratio) => (
            <text key={`ratio-${ratio}`} className="scale" x={right + 14} y={yRatio(ratio) + 4}>
              {Math.round(ratio * 100)}%
            </text>
          ))}
          {dayBoundaries.map((index) => (
            <line
              key={`day-${index}`}
              className="rule-day"
              x1={left + index * columnWidth}
              x2={left + index * columnWidth}
              y1={top}
              y2={bottom + 5}
            />
          ))}
          {days.map((day, index) => {
            const center = left + (index + 0.5) * columnWidth;
            const x = center - needleWidth / 2;
            if (day.recorded_seconds <= 0) {
              return density === "dense" ? null : (
                <rect
                  key={day.date}
                  className="gap"
                  x={x}
                  y={top + 2}
                  width={needleWidth}
                  height={bottom - top - 2}
                  rx={2}
                />
              );
            }
            const recordedY = yHours(day.recorded_seconds);
            const cap = density === "small" ? 8 : 3;
            return (
              <g key={day.date}>
                <rect className="needle-rec" x={x} y={recordedY} width={needleWidth} height={bottom - recordedY} />
                {density === "dense" ? null : (
                  <line
                    className="needle-cap"
                    x1={x - cap / 2}
                    x2={x + needleWidth + cap / 2}
                    y1={recordedY}
                    y2={recordedY}
                  />
                )}
                <rect
                  className="needle-act"
                  x={x}
                  y={yHours(day.active_seconds)}
                  width={needleWidth}
                  height={bottom - yHours(day.active_seconds)}
                />
              </g>
            );
          })}
          {labelStyle === "short" ? (
            <g>
              <text className="vals vals-dim" x={left - 9} y={bottom + 38} textAnchor="end">
                活跃
              </text>
              <text className="vals vals-dim" x={left - 9} y={bottom + 55} textAnchor="end">
                记录
              </text>
            </g>
          ) : null}
          {labelStyle !== null
            ? days.map((day, index) => {
                const center = left + (index + 0.5) * columnWidth;
                const [label, first, second] = dayLabelLines(day, labelStyle, today, format);
                return (
                  <g key={`label-${day.date}`}>
                    <text className="day" x={center} y={bottom + 20} textAnchor="middle">
                      {label}
                    </text>
                    {day.date === today ? (
                      <circle className="pen-lamp" cx={center - textWidth(label) / 2 - 8} cy={bottom + 16} r={3.5} />
                    ) : null}
                    {first ? (
                      <text
                        className={`vals ${second ? "vals-strong" : "vals-dim"}`}
                        x={center}
                        y={bottom + 38}
                        textAnchor="middle"
                      >
                        {first}
                      </text>
                    ) : null}
                    {second ? (
                      <text className="vals vals-dim" x={center} y={bottom + 55} textAnchor="middle">
                        {second}
                      </text>
                    ) : null}
                  </g>
                );
              })
            : Array.from(labels, ([index, text]) => {
                const center = left + (index + 0.5) * columnWidth;
                const isLast = index === n - 1;
                const anchor = isLast ? "end" : index === 0 ? "start" : "middle";
                const x = isLast ? left + n * columnWidth : index === 0 ? left : center;
                return (
                  <g key={`label-${index}`}>
                    <line className="rule-tick" x1={center} x2={center} y1={bottom} y2={bottom + 5} />
                    <text className="day" x={x} y={bottom + 19} textAnchor={anchor}>
                      {text}
                    </text>
                    {isLast && endsToday ? (
                      <circle className="pen-lamp" cx={x - textWidth(text) - 9} cy={bottom + 15} r={3.5} />
                    ) : null}
                  </g>
                );
              })}
          <line className="avg" x1={left} x2={right} y1={averageY} y2={averageY} />
          <path className="avg-mark" d={`M${left - 1} ${averageY} l-6 -4 v8 z`} />
          {ratioPoints.map((segment) => (
            <g key={`trace-${segment[0].index}`}>
              {segment.length > 1 ? (
                <polyline
                  className="trace"
                  points={segment
                    .map((point) => `${left + point.position * columnWidth},${yRatio(point.ratio)}`)
                    .join(" ")}
                />
              ) : null}
              {density === "dense"
                ? null
                : segment.map((point) => {
                    const cx = left + point.position * columnWidth;
                    const cy = yRatio(point.ratio);
                    return (
                      <g key={`dot-${point.index}`}>
                        <circle
                          className="trace-dot"
                          cx={cx}
                          cy={cy}
                          r={density === "small" ? 2.6 : point.index === hover ? 3.2 : 2}
                        />
                        {density === "small" ? (
                          <text className="trace-label" x={cx - 8} y={cy - 7} textAnchor="end">
                            {Math.round(point.ratio * 100)}%
                          </text>
                        ) : null}
                      </g>
                    );
                  })}
            </g>
          ))}
          {endsToday && lastDay.recorded_seconds > 0 ? (
            <RecordingHead
              x={left + (n - 0.5) * columnWidth + needleWidth / 2 + (density === "dense" ? 1 : 4)}
              y={yHours(lastDay.recorded_seconds)}
              end={right + 4}
            />
          ) : null}
        </svg>
        {hoverDay ? (
          <div className="trend-tip" style={{ left: tipLeft, top: 14 }} aria-hidden="true">
            <strong>
              {monthDay(hoverDay.date)} {weekday(hoverDay.date)}
            </strong>
            <span>
              <i className="key-act" />
              活跃 <b className="num">{format(hoverDay.active_seconds)}</b>
            </span>
            <span>
              <i className="key-rec" />
              记录 <b className="num">{format(hoverDay.recorded_seconds)}</b>
            </span>
            <span>
              <i className={density === "dense" ? "key-none" : "key-trace"} />
              活跃率 <b className="num">{formatRatio(hoverDay.active_seconds, hoverDay.recorded_seconds)}</b>
            </span>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function RecordingHead({ x, y, end }: { x: number; y: number; end: number }) {
  return (
    <>
      <path className="pen" d={`M${x} ${y} l9 -6 v12 z`} />
      {/* The arm stops short of the ratio scale labels in the right gutter. */}
      {end > x + 9 ? <line className="pen-arm" x1={x + 9} x2={end} y1={y} y2={y} /> : null}
    </>
  );
}

interface RatioPoint {
  index: number;
  /** Centre of the point in columns from the left edge. */
  position: number;
  ratio: number;
}

/** Daily active ratio, split into segments where a day has no records. */
function dailyRatios(days: StatisticsDay[]): RatioPoint[][] {
  return segments(
    days.map((day, index) =>
      day.recorded_seconds > 0
        ? { index, position: index + 0.5, ratio: day.active_seconds / day.recorded_seconds }
        : null,
    ),
  );
}

/** Active ratio per 7-day block from the range start, for long ranges. */
function weeklyRatios(days: StatisticsDay[]): RatioPoint[][] {
  const points: Array<RatioPoint | null> = [];
  for (let start = 0; start < days.length; start += 7) {
    const week = days.slice(start, start + 7);
    const recorded = sum(week, "recorded_seconds");
    points.push(
      recorded > 0
        ? { index: start, position: start + week.length / 2, ratio: sum(week, "active_seconds") / recorded }
        : null,
    );
  }
  return segments(points);
}

function segments(points: Array<RatioPoint | null>): RatioPoint[][] {
  const result: RatioPoint[][] = [];
  let current: RatioPoint[] = [];
  for (const point of points) {
    if (point) {
      current.push(point);
    } else if (current.length > 0) {
      result.push(current);
      current = [];
    }
  }
  if (current.length > 0) result.push(current);
  return result;
}

function dayLabel(day: StatisticsDay, today: string): string {
  return `${monthDay(day.date)} ${weekday(day.date)}${day.date === today ? "（今天）" : ""}`;
}

/** The two value rows under a day: active and recorded time, or 无记录 alone. */
function valueLabels(day: StatisticsDay, format: (seconds: number) => string): [string, string] {
  return day.recorded_seconds <= 0
    ? ["无记录", ""]
    : [`活跃 ${format(day.active_seconds)}`, `记录 ${format(day.recorded_seconds)}`];
}

/**
 * The lines under a day in a label style: the day line, then the active and recorded rows
 * (无记录 alone on a day without records). Short and dates styles call today just 今天.
 */
function dayLabelLines(
  day: StatisticsDay,
  style: LabelStyle,
  today: string,
  format: (seconds: number) => string,
): string[] {
  if (style === "full") return [dayLabel(day, today), ...valueLabels(day, format)];
  const head = day.date === today ? "今天" : `${monthDay(day.date)} ${weekday(day.date)}`;
  if (style === "dates") return [head];
  return day.recorded_seconds <= 0
    ? [head, "无记录", ""]
    : [head, format(day.active_seconds), format(day.recorded_seconds)];
}

/** Whether each centred label row clears its left neighbour's (today's label also carries the lamp). */
function dayLabelsFit(
  days: StatisticsDay[],
  style: LabelStyle,
  columnWidth: number,
  today: string,
  format: (seconds: number) => string,
): boolean {
  const rows = days.map((day) => dayLabelLines(day, style, today, format).map(textWidth));
  return rows.every(
    (row, index) =>
      index === 0 ||
      row.every((width, line) => {
        const lamp = line === 0 && days[index].date === today ? LAMP_REACH : 0;
        return rows[index - 1][line] / 2 + width / 2 + lamp + LABEL_GAP <= columnWidth;
      }),
  );
}

/**
 * Up to 40 days: the first day, each first day of the week (`weekStart`, a `getDay()` index) and the last day. Longer: the first day, month starts, the last day.
 * A middle label is dropped when its box would come within LABEL_GAP of the previous label or of the
 * end-anchored last label (and today's lamp before it). Positions are relative to the plot's left edge.
 */
function sparseLabels(
  days: StatisticsDay[],
  density: Density,
  today: string,
  columnWidth: number,
  weekStart: WeekStart = 1,
): Map<number, string> {
  const n = days.length;
  const first = monthDay(days[0].date);
  const last = days[n - 1].date === today ? "今天" : monthDay(days[n - 1].date);
  const lastStart = n * columnWidth - textWidth(last) - (days[n - 1].date === today ? END_LAMP_REACH : 0);
  const labels = new Map<number, string>([[0, first]]);
  let previousEnd = textWidth(first);
  days.forEach((day, index) => {
    if (index === 0 || index === n - 1) return;
    const text =
      density === "mid" && localDate(day.date).getDay() === weekStart
        ? monthDay(day.date)
        : density === "dense" && day.date.endsWith("-01")
          ? `${Number(day.date.slice(5, 7))}月`
          : null;
    if (text === null) return;
    const center = (index + 0.5) * columnWidth;
    const half = textWidth(text) / 2;
    if (center - half < previousEnd + LABEL_GAP || center + half + LABEL_GAP > lastStart) return;
    labels.set(index, text);
    previousEnd = center + half;
  });
  labels.set(n - 1, last);
  return labels;
}

function changeText(available: boolean, current: number, previous: number): string {
  const change = available ? percentChange(current, previous) : null;
  if (change === null) return "无对比";
  return `比上期 ${change > 0 ? "+" : ""}${change}%`;
}

function formatRatio(active: number, recorded: number): string {
  return recorded > 0 ? `${Math.round((active / recorded) * 100)}%` : "—";
}

function sum(days: StatisticsDay[], field: "recorded_seconds" | "active_seconds"): number {
  return days.reduce((total, day) => total + day[field], 0);
}

function monthDay(date: string): string {
  return date.slice(5);
}

function weekday(date: string): string {
  return WEEKDAYS[localDate(date).getDay()];
}

/**
 * Rough rendered width of a 12px label, rounded up from Segoe UI / Microsoft YaHei UI:
 * CJK glyphs are square, digits about half, other ASCII (space, dash, dot) about a third.
 */
function textWidth(text: string): number {
  return Array.from(text).reduce((width, char) => {
    if (char.charCodeAt(0) > 255) return width + 12;
    return width + (char >= "0" && char <= "9" ? 6.6 : 4);
  }, 0);
}
