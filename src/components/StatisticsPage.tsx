import { CalendarDays } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { getStatisticsSummary, type DurationFormat, type StatisticsSummary } from "../api";
import type { StatisticsScope } from "../exports";
import {
  DEFAULT_RANGE_PRESET,
  RANGE_PRESET_LABELS,
  formatLocalDate,
  presetRange,
  validateCustomRange,
  type DateRange,
  type RangePreset,
} from "../statisticsRange";
import { startVisiblePolling } from "../visiblePolling";
import { useWeekStart } from "../weekStart";
import { RangeControl } from "./RangeControl";
import { StatisticsLedgers } from "./StatisticsLedgers";
import { TrendRecorder } from "./TrendRecorder";
import "./StatisticsPage.css";

interface StatisticsPageProps {
  durationFormat?: DurationFormat;
  /** Reports the range and 包含隐藏软件 switch in use, for the header's 导出报表 key; null once unmounted. */
  onScopeChange?: (scope: StatisticsScope | null) => void;
}

const PRESETS: RangePreset[] = ["last7", "thisWeek", "thisMonth", "last30", "thisYear", "custom"];
// The range includes today, so its numbers keep growing while the page is open.
const POLL_INTERVAL_MS = 60_000;

export function StatisticsPage({ durationFormat = "decimal_hours", onScopeChange }: StatisticsPageProps) {
  const [preset, setPreset] = useState<RangePreset>(DEFAULT_RANGE_PRESET);
  const [draft, setDraft] = useState<DateRange>({ start: "", end: "" });
  const [customRange, setCustomRange] = useState<DateRange | null>(null);
  const [includeHidden, setIncludeHidden] = useState(false);
  const [dataStartDate, setDataStartDate] = useState<string | null>(null);
  const [summary, setSummary] = useState<StatisticsSummary | null>(null);
  // Which request the shown summary and the last failure belong to, as `start|end|includeHidden`.
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [failedKey, setFailedKey] = useState<string | null>(null);
  const mountedRef = useRef(false);
  const latestRequestRef = useRef(0);
  const weekStart = useWeekStart();

  const now = new Date();
  const today = formatLocalDate(now);
  const range =
    preset !== "custom"
      ? presetRange(preset, now, dataStartDate, weekStart)
      : (customRange ?? presetRange("last7", now, dataStartDate));
  const { start, end } = range;
  const draftError = preset === "custom" ? validateCustomRange(draft.start, draft.end, now, dataStartDate) : null;
  const requestKey = `${start}|${end}|${includeHidden}`;
  const fetchError = failedKey === requestKey;
  // The shown summary belongs to an earlier selection while the new one loads.
  const pending = summary !== null && loadedKey !== requestKey;
  // If the new selection cannot be read, the earlier numbers would pass for it: drop them.
  const shown = pending && fetchError ? null : summary;

  const refresh = useCallback(async () => {
    const request = ++latestRequestRef.current;
    const key = `${start}|${end}|${includeHidden}`;
    try {
      const next = await getStatisticsSummary({ start, end, includeHidden });
      if (!mountedRef.current || request !== latestRequestRef.current) return;
      setSummary(next);
      setLoadedKey(key);
      setDataStartDate(next.data_start_date);
      setFailedKey(null);
    } catch {
      if (mountedRef.current && request === latestRequestRef.current) setFailedKey(key);
    }
  }, [start, end, includeHidden]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => startVisiblePolling(refresh, POLL_INTERVAL_MS), [refresh]);

  useEffect(() => {
    onScopeChange?.({ start, end, includeHidden });
  }, [onScopeChange, start, end, includeHidden]);

  useEffect(() => () => onScopeChange?.(null), [onScopeChange]);

  // A custom range is applied as soon as both dates pass validation.
  useEffect(() => {
    if (preset === "custom" && draftError === null) {
      setCustomRange({ start: draft.start, end: draft.end });
    }
  }, [preset, draft.start, draft.end, draftError]);

  const selectPreset = (next: RangePreset) => {
    if (next === "custom" && preset !== "custom") {
      setDraft(range);
      setCustomRange(range);
    }
    setPreset(next);
  };

  return (
    <main className="stats-page" id="statistics-content">
      <div className="stats-range">
        <div className="segmented" role="radiogroup" aria-label="统计区间">
          {PRESETS.map((option) => (
            <button
              key={option}
              className={`segmented-option${option === preset ? " is-selected" : ""}${option === "custom" ? " stats-custom" : ""}`}
              type="button"
              role="radio"
              aria-checked={option === preset}
              onClick={() => selectPreset(option)}
            >
              {option === "custom" ? <CalendarDays size={14} aria-hidden="true" /> : null}
              {RANGE_PRESET_LABELS[option]}
            </button>
          ))}
        </div>
        {preset === "custom" ? (
          <span className="stats-custom-range">
            <RangeControl
              value={draft}
              today={today}
              dataStartDate={dataStartDate}
              onChange={setDraft}
            />
            {draftError ? (
              <span className="stats-range-error" role="alert">
                {draftError}
              </span>
            ) : null}
          </span>
        ) : null}
        {pending && !fetchError ? (
          <span className="stats-range-caption num" role="status">
            正在读取 {start} 至 {shortEnd(start, end)}…
          </span>
        ) : shown ? (
          // In 自定义 the range key already shows the range it answers; the caption keeps the comparison.
          <RangeCaption
            summary={shown}
            showRange={!(preset === "custom" && shown.start === draft.start && shown.end === draft.end)}
          />
        ) : null}
        <span className="stats-hidden-toggle">
          <span aria-hidden="true">包含隐藏软件</span>
          <button
            className={`toggle${includeHidden ? " is-on" : ""}`}
            type="button"
            role="switch"
            aria-checked={includeHidden}
            aria-label="包含隐藏软件"
            onClick={() => setIncludeHidden((current) => !current)}
          >
            <span className="toggle-knob" aria-hidden="true" />
          </button>
        </span>
      </div>

      {fetchError ? (
        <div className="warning" role="alert">
          无法读取统计
        </div>
      ) : null}

      {!shown ? (
        fetchError ? null : (
          <p role="status" className="empty-state">
            正在读取统计…
          </p>
        )
      ) : (
        <div className={`stats-results${pending ? " is-pending" : ""}`} aria-busy={pending}>
          {shown.days.every((day) => day.recorded_seconds <= 0) ? (
            <section className="panel stats-panel" aria-label="统计">
              <div className="empty-state">
                <strong>这段时间没有记录</strong>
                <span>保持 GST 在托盘运行，之后的记录会出现在这里。</span>
              </div>
            </section>
          ) : (
            <>
              <TrendRecorder summary={shown} durationFormat={durationFormat} today={today} />
              <StatisticsLedgers summary={shown} durationFormat={durationFormat} />
            </>
          )}
        </div>
      )}
    </main>
  );
}

function RangeCaption({ summary, showRange }: { summary: StatisticsSummary; showRange: boolean }) {
  const comparison = summary.system_comparison_available
    ? `对比 ${shortRange(summary.start, summary.previous_start, summary.previous_end)}`
    : summary.data_start_date
      ? `数据从 ${shortEnd(summary.start, summary.data_start_date)} 开始，没有对比区间`
      : "没有对比区间";

  return (
    <span className="stats-range-caption num">
      {showRange ? (
        <>
          {summary.start} 至 {shortEnd(summary.start, summary.end)}
          <i aria-hidden="true" />
        </>
      ) : null}
      {comparison}
    </span>
  );
}

/** The comparison range; its start keeps the year when it differs from the selected range's. */
function shortRange(rangeStart: string, start: string, end: string): string {
  return `${shortEnd(rangeStart, start)} 至 ${shortEnd(start, end)}`;
}

/** Drops the year from `date` when it is the same as `reference`'s. */
function shortEnd(reference: string, date: string): string {
  return reference.slice(0, 4) === date.slice(0, 4) ? date.slice(5) : date;
}
