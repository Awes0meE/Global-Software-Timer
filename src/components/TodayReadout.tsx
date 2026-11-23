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
  const recorded = useShownReading("recorded", summary.recorded_today_seconds, durationFormat, summary.usage_date);
  const active = useShownReading("active", summary.active_today_seconds, durationFormat, summary.usage_date);

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
  /** The summary's usage_date: the local calendar date the shown reading belongs to. */
  usageDate: string;
  /** The seconds the shown text was formatted from, to tell a shrink from a rise. */
  seconds: number;
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

/**
 * `last` moved on to the reading shown now; the same object when the shown text, the format and the
 * date have not changed and the reading has not shrunk. A reading of another date leaves no ghost,
 * even with the same text: the summary names the date its readings belong to, so a day rollover is
 * seen also when the window sat hidden in the tray or on another page across midnight. A smaller
 * reading (in seconds, even with the same text) leaves no ghost either.
 */
function nextShown(last: Shown | undefined, seconds: number, format: DurationFormat, usageDate: string): Shown {
  const text = formatDurationZh(seconds, format);
  const kept =
    last !== undefined && last.format === format && last.usageDate === usageDate && seconds >= last.seconds;
  if (kept && last.text === text) return last;
  return {
    format,
    usageDate,
    seconds,
    text,
    parts: formatDurationPartsZh(seconds, format),
    previous: kept ? last.parts : null,
  };
}

/**
 * The reading shown now and, for the e-ink ghost, the one shown before it in this window; `previous`
 * is null until the shown text changes, again after the duration format or the date (`usageDate`, from
 * the summary, never the render-time clock) changes, and when the reading shrank. Moved on during
 * render, so each change is remembered once, also under StrictMode.
 */
function useShownReading(reading: Reading, seconds: number, format: DurationFormat, usageDate: string): Shown {
  const [shown, setShown] = useState<Shown>(() =>
    nextShown(shownInWindow.get(reading), seconds, format, usageDate),
  );
  const current = nextShown(shown, seconds, format, usageDate);
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
