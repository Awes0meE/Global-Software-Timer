import { CalendarDays, ChevronDown } from "lucide-react";
import type { DateRange } from "../statisticsRange";
import { RangeCalendar } from "./DayCalendar";
import { usePixelSnap, usePopover } from "./usePopover";
import "./HeaderControls.css";

interface RangeControlProps {
  /** Inclusive local dates, `YYYY-MM-DD`. */
  value: DateRange;
  /** Local `YYYY-MM-DD`. */
  today: string;
  /** The first day with records, or `null` before the first record. */
  dataStartDate: string | null;
  onChange: (range: DateRange) => void;
}

/** 统计 自定义: one key showing the range; it opens the calendar in range mode (two clicks: start, end). */
export function RangeControl({ value, today, dataStartDate, onChange }: RangeControlProps) {
  const { open, toggle, closeToTrigger, rootRef, triggerRef } = usePopover();
  const snap = usePixelSnap(open, rootRef, "start");

  return (
    <div className="hk-wrap" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className="hk hk-solo hk-range"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`统计区间 ${value.start} 至 ${value.end}，打开日历`}
        onClick={toggle}
      >
        <CalendarDays size={16} aria-hidden="true" />
        <span className="hk-date-text">
          <span className="num">{value.start}</span>
          <span className="hk-week">至</span>
          <span className="num">{value.end}</span>
        </span>
        <ChevronDown size={14} className="hk-caret" aria-hidden="true" />
      </button>
      {open ? (
        <div className="glass-pop hk-cal-pop paper" role="dialog" aria-label="选择统计区间" style={snap}>
          <RangeCalendar
            range={value}
            today={today}
            dataStartDate={dataStartDate}
            onSelect={(range) => {
              closeToTrigger();
              onChange(range);
            }}
          />
        </div>
      ) : null}
    </div>
  );
}
