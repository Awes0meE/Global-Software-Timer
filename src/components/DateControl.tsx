import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { DayCalendar, addLocalDays, spokenDate, weekdayLabel } from "./DayCalendar";
import { usePixelSnap, usePopover } from "./usePopover";
import "./HeaderControls.css";

interface DateControlProps {
  /** The day the page shows, local `YYYY-MM-DD`. */
  value: string;
  /** Local `YYYY-MM-DD`. */
  today: string;
  /** The first day with records, or `null` before the first record. */
  dataStartDate: string | null;
  onChange: (date: string) => void;
}

/** The 概览 / 后台 header date key: [‹][date ⌄][›], a 今天 key on a past day, and the calendar popover. */
export function DateControl({ value, today, dataStartDate, onChange }: DateControlProps) {
  const { open, toggle, closeToTrigger, rootRef, triggerRef } = usePopover();
  const snap = usePixelSnap(open, rootRef, "start");
  const isToday = value >= today;
  const atStart = dataStartDate === null || value <= dataStartDate;

  // A step key that reaches the end of the range turns disabled (and the 今天 key goes on today), which
  // would drop focus; hand it to the date key instead.
  const go = (date: string) => {
    onChange(date);
    if (date >= today || dataStartDate === null || date <= dataStartDate) triggerRef.current?.focus();
  };

  return (
    <div className="hk-wrap" ref={rootRef}>
      <div className="hk-group" role="group" aria-label="查看日期">
        <button
          type="button"
          className="hk hk-step"
          aria-label="前一天"
          aria-keyshortcuts="Control+ArrowLeft"
          disabled={atStart}
          onClick={() => go(addLocalDays(value, -1))}
        >
          <ChevronLeft size={16} strokeWidth={2} aria-hidden="true" />
        </button>
        <button
          ref={triggerRef}
          type="button"
          className="hk hk-date"
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-label={`${spokenDate(value)}，打开日历`}
          onClick={toggle}
        >
          <CalendarDays size={16} aria-hidden="true" />
          <span className="hk-date-text">
            <span className="num">{value}</span>
            <span className="hk-week">{weekdayLabel(value)}</span>
          </span>
          <ChevronDown size={14} className="hk-caret" aria-hidden="true" />
        </button>
        <button
          type="button"
          className="hk hk-step"
          aria-label="后一天"
          aria-keyshortcuts="Control+ArrowRight"
          disabled={isToday}
          onClick={() => go(addLocalDays(value, 1))}
        >
          <ChevronRight size={16} strokeWidth={2} aria-hidden="true" />
        </button>
      </div>
      {isToday ? null : (
        <button type="button" className="hk hk-solo" onClick={() => go(today)}>
          今天
        </button>
      )}
      {open ? (
        <div className="glass-pop hk-cal-pop paper" role="dialog" aria-label="选择日期" style={snap}>
          <DayCalendar
            selected={value}
            today={today}
            dataStartDate={dataStartDate}
            onSelect={(date) => {
              closeToTrigger();
              onChange(date);
            }}
          />
        </div>
      ) : null}
    </div>
  );
}
