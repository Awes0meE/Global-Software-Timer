import { useEffect, useState } from "react";
import type { DashboardSummary, DurationFormat } from "../api";
import { formatDurationPartsZh, formatDurationZh, type DurationPart } from "../i18n";
import { LcdDial } from "./LcdDial";
import { SoftwareIcon } from "./SoftwareIcon";

interface Props {
  summary: DashboardSummary;
  durationFormat?: DurationFormat;
  now?: Date;
}

export function TodayReadout({ summary, durationFormat = "decimal_hours", now = new Date() }: Props) {
  const recorded = useShownReading("recorded", summary.recorded_today_seconds, durationFormat);
  const active = useShownReading("active", summary.active_today_seconds, durationFormat);

  return (
    <section className="readout" aria-label="今日总览">
      <div className="lcd">
        <LcdDial
          recordedSeconds={summary.recorded_today_seconds}
          activeSeconds={summary.active_today_seconds}
          now={now}
        />
        <div className="lcd-cell">
          <p className="lcd-label">
            <i className="lcd-key lcd-key-recorded" aria-hidden="true" />
            今日记录
          </p>
          <LcdValue reading={recorded} />
          <p className="lcd-note">GST 记录到的开机时间</p>
        </div>
        <div className="lcd-cell">
          <p className="lcd-label">
            <i className="lcd-key lcd-key-active" aria-hidden="true" />
            今日活跃
          </p>
          <LcdValue reading={active} />
          <p className="lcd-note">检测到键盘或鼠标操作</p>
        </div>
        <div className="lcd-cell lcd-cell-most">
          <p className="lcd-label">最常用</p>
          {summary.most_used ? (
            <>
              <div className="lcd-most">
                <SoftwareIcon app={summary.most_used} size="sm" />
                <strong>{summary.most_used.display_name}</strong>
              </div>
              <p className="lcd-note">
                {summary.most_used.active_today_seconds > 0
                  ? `今日活跃 ${formatDurationZh(summary.most_used.active_today_seconds, durationFormat)}`
                  : `今日 ${formatDurationZh(summary.most_used.today_seconds, durationFormat)}`}
              </p>
            </>
          ) : (
            <>
              <div className="lcd-most">
                <strong>暂无数据</strong>
              </div>
              <p className="lcd-note">打开软件后会在这里显示</p>
            </>
          )}
        </div>
      </div>
    </section>
  );
}

type Reading = "recorded" | "active";

interface Shown {
  format: DurationFormat;
  text: string;
  parts: DurationPart[];
  previous: DurationPart[] | null;
}

/**
 * What each large reading last showed in this window. Kept outside the component, so leaving the
 * overview and coming back keeps the ghost; it resets only when the window's page is loaded again.
 */
const shownInWindow = new Map<Reading, Shown>();

/** Forgets every shown reading, as a newly opened window would. For tests. */
export function forgetShownReadings() {
  shownInWindow.clear();
}

/** `last` moved on to the reading shown now; the same object when the shown text has not changed. */
function nextShown(last: Shown | undefined, seconds: number, format: DurationFormat): Shown {
  const text = formatDurationZh(seconds, format);
  if (last && last.format === format && last.text === text) return last;
  return {
    format,
    text,
    parts: formatDurationPartsZh(seconds, format),
    previous: last && last.format === format ? last.parts : null,
  };
}

/**
 * The reading shown now and, for the e-ink ghost, the one shown before it in this window; `previous`
 * is null until the shown text changes, and again after the duration format changes. Moved on during
 * render, so each change is remembered once, also under StrictMode.
 */
function useShownReading(reading: Reading, seconds: number, format: DurationFormat): Shown {
  const [shown, setShown] = useState<Shown>(() => nextShown(shownInWindow.get(reading), seconds, format));
  const current = nextShown(shown, seconds, format);
  if (current !== shown) setShown(current);

  useEffect(() => {
    shownInWindow.set(reading, current);
  }, [reading, current]);

  return current;
}

function LcdValue({ reading }: { reading: Shown }) {
  return (
    <p className="lcd-value">
      {reading.previous ? (
        // Drawn from data-text by ::before, so the ghost adds no text for readers or queries.
        <span className="lcd-value lcd-ghost" aria-hidden="true">
          {reading.previous.map((part) => (
            <span key={part.unit}>
              <b data-text={part.value} />
              <small data-text={part.unit} />
            </span>
          ))}
        </span>
      ) : null}
      {reading.parts.map((part) => (
        <span key={part.unit}>
          <b>{part.value}</b>
          <small>{part.unit}</small>
        </span>
      ))}
    </p>
  );
}
