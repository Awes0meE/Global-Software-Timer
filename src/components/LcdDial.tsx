interface Props {
  recordedSeconds: number;
  activeSeconds: number;
  now: Date;
}

const SIZE = 184;
const CENTER = SIZE / 2;
const SEGMENTS = 48;
const SEGMENT_SECONDS = (24 * 3600) / SEGMENTS;
const GAP_DEGREES = 1.6;

function point(radius: number, degrees: number): [number, number] {
  const radians = (degrees * Math.PI) / 180;
  return [CENTER + radius * Math.sin(radians), CENTER - radius * Math.cos(radians)];
}

function segmentPath(index: number, outer: number, inner: number): string {
  const start = (index / SEGMENTS) * 360 + GAP_DEGREES / 2;
  const end = ((index + 1) / SEGMENTS) * 360 - GAP_DEGREES / 2;
  const [x1, y1] = point(outer, start);
  const [x2, y2] = point(outer, end);
  const [x3, y3] = point(inner, end);
  const [x4, y4] = point(inner, start);
  const f = (value: number) => value.toFixed(2);

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

/**
 * A segmented LCD capacity gauge: a full ring is 24 hours of time, each segment half an hour.
 * Lit segments count today's totals (they are not a timeline); the pointer marks how much of
 * the day has passed, which is the most either total can reach.
 */
export function LcdDial({ recordedSeconds, activeSeconds, now }: Props) {
  const minutesToday = now.getHours() * 60 + now.getMinutes();
  const nowDegrees = (minutesToday / (24 * 60)) * 360;
  const [tipX, tipY] = point(CENTER - 2, nowDegrees);
  const [leftX, leftY] = point(CENTER - 11, nowDegrees - 3.2);
  const [rightX, rightY] = point(CENTER - 11, nowDegrees + 3.2);
  const elapsed = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

  return (
    <figure className="lcd-dial" aria-label={`满圈 24 小时，今日已过 ${elapsed}`}>
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} width={SIZE} height={SIZE} aria-hidden="true">
        <Ring className="lcd-ring lcd-ring-recorded" lit={litSegments(recordedSeconds)} outer={78} inner={66} />
        <Ring className="lcd-ring lcd-ring-active" lit={litSegments(activeSeconds)} outer={61} inner={53} />
        {[0, 6, 12, 18].map((hour) => {
          const [x, y] = point(41, hour * 15);
          return (
            <text key={hour} className="lcd-dial-hour" x={x} y={y + 4} textAnchor="middle">
              {hour}h
            </text>
          );
        })}
        <path
          className="lcd-dial-now"
          d={`M${tipX.toFixed(2)} ${tipY.toFixed(2)}L${leftX.toFixed(2)} ${leftY.toFixed(2)}L${rightX.toFixed(2)} ${rightY.toFixed(2)}Z`}
        />
      </svg>
      <figcaption className="lcd-dial-clock">
        <span>今日已过</span>
        <strong>{elapsed}</strong>
      </figcaption>
    </figure>
  );
}
