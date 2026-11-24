import { parseLocalDate, weekdayLabel } from "./DayCalendar";

interface Props {
  recordedSeconds: number;
  activeSeconds: number;
  now: Date;
  /** A past day's local `YYYY-MM-DD`: the whole day has passed, so every tick is inked and no pointer shows. */
  pastDay?: string;
}

const DAY_MINUTES = 24 * 60;

const SIZE = 184;
const CENTER = SIZE / 2;
const SEGMENTS = 48;
const SEGMENT_SECONDS = (24 * 3600) / SEGMENTS;
const GAP_DEGREES = 1.6;
const TICKS = 96;
const TICK_MINUTES = (24 * 60) / TICKS;
const TICK_INNER = 81;
const TICK_OUTER = 89;
const TICK_OUTER_HOUR = 91;
/** Ticks within ±5° of the pointer (20 minutes, at most 3 ticks) yield to it so it reads as a clean triangle. */
const NEAR_NOW_MINUTES = 20;

function point(radius: number, degrees: number): [number, number] {
  const radians = (degrees * Math.PI) / 180;
  return [CENTER + radius * Math.sin(radians), CENTER - radius * Math.cos(radians)];
}

const f = (value: number) => value.toFixed(2);

function segmentPath(index: number, outer: number, inner: number): string {
  const start = (index / SEGMENTS) * 360 + GAP_DEGREES / 2;
  const end = ((index + 1) / SEGMENTS) * 360 - GAP_DEGREES / 2;
  const [x1, y1] = point(outer, start);
  const [x2, y2] = point(outer, end);
  const [x3, y3] = point(inner, end);
  const [x4, y4] = point(inner, start);

  return `M${f(x1)} ${f(y1)}A${outer} ${outer} 0 0 1 ${f(x2)} ${f(y2)}L${f(x3)} ${f(y3)}A${inner} ${inner} 0 0 0 ${f(x4)} ${f(y4)}Z`;
}

function litSegments(seconds: number): number {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return 0;
  }

  return Math.min(SEGMENTS, Math.floor(seconds / SEGMENT_SECONDS));
}

function Ring({ lit, outer, inner, className }: { lit: number; outer: number; inner: number; className: string }) {
  return (
    <g className={className}>
      {Array.from({ length: SEGMENTS }, (_, index) => (
        <path
          key={index}
          className={index < lit ? "is-lit" : undefined}
          d={segmentPath(index, outer, inner)}
        />
      ))}
    </g>
  );
}

function isNearNow(tickMinutes: number, minutesToday: number): boolean {
  const distance = Math.abs(tickMinutes - minutesToday) % (24 * 60);
  return Math.min(distance, 24 * 60 - distance) <= NEAR_NOW_MINUTES;
}

/**
 * 96 quarter-hour ticks outside the rings; the hour ones are longer. Ticks before now are inked;
 * the ones under the pointer are marked so they can be drawn lighter. Without a pointer (a past day,
 * `minutesToday` a whole day) every tick is inked and none yields.
 */
function Ticks({ minutesToday, pointer }: { minutesToday: number; pointer: boolean }) {
  return (
    <g>
      {Array.from({ length: TICKS }, (_, index) => {
        const isHour = index % 4 === 0;
        const tickMinutes = index * TICK_MINUTES;
        const degrees = (index / TICKS) * 360;
        const [x1, y1] = point(TICK_INNER, degrees);
        const [x2, y2] = point(isHour ? TICK_OUTER_HOUR : TICK_OUTER, degrees);
        const className = [
          "lcd-tick",
          isHour && "is-hour",
          tickMinutes < minutesToday && "is-past",
          pointer && isNearNow(tickMinutes, minutesToday) && "is-near-now",
        ]
          .filter(Boolean)
          .join(" ");

        return <line key={index} className={className} x1={f(x1)} y1={f(y1)} x2={f(x2)} y2={f(y2)} />;
      })}
    </g>
  );
}

/**
 * An e-ink capacity dial: a full ring is 24 hours of time, each segment half an hour.
 * Lit segments count today's totals (they are not a timeline); the 96 ticks outside the rings
 * and the pointer mark how much of the day has passed, which is the most either total can reach.
 * A past day has passed whole: every tick is inked, no pointer, and the centre names the day.
 */
export function LcdDial({ recordedSeconds, activeSeconds, now, pastDay }: Props) {
  const shownDay = pastDay === undefined ? null : parseLocalDate(pastDay);
  const minutesToday = shownDay ? DAY_MINUTES : now.getHours() * 60 + now.getMinutes();
  const nowDegrees = (minutesToday / DAY_MINUTES) * 360;
  const [tipX, tipY] = point(CENTER - 2, nowDegrees);
  const [leftX, leftY] = point(CENTER - 11, nowDegrees - 3.2);
  const [rightX, rightY] = point(CENTER - 11, nowDegrees + 3.2);
  const elapsed = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

  return (
    <figure
      className="lcd-dial"
      aria-label={shownDay ? "满圈 24 小时" : `满圈 24 小时，今日已过 ${elapsed}`}
    >
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} width={SIZE} height={SIZE} aria-hidden="true">
        <Ring className="lcd-ring lcd-ring-recorded" lit={litSegments(recordedSeconds)} outer={78} inner={66} />
        <Ring className="lcd-ring lcd-ring-active" lit={litSegments(activeSeconds)} outer={61} inner={53} />
        <rect className="lcd-midnight-mark" x={CENTER - 1} y="45" width="2" height="8" />
        <Ticks minutesToday={minutesToday} pointer={shownDay === null} />
        {[6, 12, 18].map((hour) => {
          const [x, y] = point(41, hour * 15);
          return (
            <text key={hour} className="lcd-dial-hour" x={x} y={y + 4} textAnchor="middle">
              {hour}h
            </text>
          );
        })}
        {shownDay ? null : (
          <path
            className="lcd-dial-now"
            d={`M${tipX.toFixed(2)} ${tipY.toFixed(2)}L${leftX.toFixed(2)} ${leftY.toFixed(2)}L${rightX.toFixed(2)} ${rightY.toFixed(2)}Z`}
          />
        )}
      </svg>
      {shownDay ? (
        <figcaption className="lcd-dial-clock">
          <span>{weekdayLabel(pastDay ?? "")}</span>
          <strong>{`${shownDay.getDate()}日`}</strong>
        </figcaption>
      ) : (
        <figcaption className="lcd-dial-clock">
          <span>今日已过</span>
          <strong>{elapsed}</strong>
        </figcaption>
      )}
    </figure>
  );
}
