// The date-picking calendar of the header date key and the 统计 自定义 range, built on react-day-picker
// (MIT, https://daypicker.dev; its stylesheet is not imported, HeaderControls.css styles it). A plain date
// picker printed on the popover's e-ink screen: no per-day data (the heatmap lives on the 成就 page).
import { createContext, useContext, useMemo, useRef, useState, type HTMLAttributes, type TableHTMLAttributes } from "react";
import { DayPicker, useDayPicker, type CalendarMonth, type Matcher, type PropsBase } from "react-day-picker";
import { zhCN } from "react-day-picker/locale";
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import type { DateRange } from "../statisticsRange";
import { formatLocalDate } from "../statisticsRange";

const WEEKDAYS = "日一二三四五六";
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/** A local `YYYY-MM-DD` date as local midnight, or `null` for anything else. */
export function parseLocalDate(value: string | null | undefined): Date | null {
  const match = value ? DATE_PATTERN.exec(value) : null;
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return formatLocalDate(date) === value ? date : null;
}

/** `date` moved by whole calendar days (DST-safe: built from the parts, not from milliseconds). */
export function addLocalDays(value: string, days: number): string {
  const date = parseLocalDate(value);
  if (!date) return value;
  return formatLocalDate(new Date(date.getFullYear(), date.getMonth(), date.getDate() + days));
}

/** `周二` for a local `YYYY-MM-DD` date. */
export function weekdayLabel(value: string): string {
  const date = parseLocalDate(value);
  return date ? `周${WEEKDAYS[date.getDay()]}` : "";
}

/** `2026年11月24日 星期二`, the date as the keys announce it. */
export function spokenDate(value: string): string {
  const date = parseLocalDate(value);
  if (!date) return value;
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日 星期${WEEKDAYS[date.getDay()]}`;
}

const monthCaption = (date: Date) => `${date.getFullYear()}年${date.getMonth() + 1}月`;
const startOfMonth = (date: Date) => new Date(date.getFullYear(), date.getMonth(), 1);
const monthIndex = (date: Date) => date.getFullYear() * 12 + date.getMonth();

interface Bounds {
  /** The first pickable day: the data start, or today when there is no data yet. */
  first: Date;
  today: Date;
}

function bounds(today: string, dataStartDate: string | null): Bounds {
  const end = parseLocalDate(today) ?? parseLocalDate(formatLocalDate(new Date()))!;
  const start = parseLocalDate(dataStartDate);
  return { first: start && start < end ? start : end, today: end };
}

interface CaptionState {
  openMonths: () => void;
  /** The first month that has pickable days (the data start's). */
  firstMonth: Date;
  /** The last month that has pickable days (today's). */
  lastMonth: Date;
}

const CaptionContext = createContext<CaptionState>({ openMonths: () => {}, firstMonth: new Date(), lastMonth: new Date() });

/** The caption row: ‹ month key, a 2026年11月 key that opens the month view, › month key. */
function CaptionKeys({
  calendarMonth,
  displayIndex: _displayIndex,
  children,
  ...divProps
}: { calendarMonth: CalendarMonth; displayIndex: number } & HTMLAttributes<HTMLDivElement>) {
  const { previousMonth, nextMonth, goToMonth } = useDayPicker();
  const { openMonths, firstMonth, lastMonth } = useContext(CaptionContext);
  const captionRef = useRef<HTMLButtonElement>(null);
  // startMonth and endMonth run one month past the pickable ones so their outside days still render (dim
  // and disabled); the month keys stop at the pickable months.
  const shown = monthIndex(calendarMonth.date);
  const previous = shown > monthIndex(firstMonth) ? previousMonth : undefined;
  const next = shown < monthIndex(lastMonth) ? nextMonth : undefined;
  // A month key that reaches the end turns disabled, which would drop focus; hand it to the caption key.
  const step = (target: Date) => {
    goToMonth(target);
    if (monthIndex(target) === monthIndex(firstMonth) || monthIndex(target) === monthIndex(lastMonth)) {
      captionRef.current?.focus();
    }
  };
  return (
    <div {...divProps}>
      <button
        type="button"
        className="cal-key cal-step"
        aria-label="上个月"
        disabled={!previous}
        onClick={() => previous && step(previous)}
      >
        <ChevronLeft size={16} aria-hidden="true" />
      </button>
      <button
        ref={captionRef}
        type="button"
        className="cal-key cal-caption"
        aria-expanded={false}
        aria-label={`${monthCaption(calendarMonth.date)}，选择年月`}
        onClick={openMonths}
      >
        {children}
        <ChevronDown size={14} aria-hidden="true" />
      </button>
      <button
        type="button"
        className="cal-key cal-step"
        aria-label="下个月"
        disabled={!next}
        onClick={() => next && step(next)}
      >
        <ChevronRight size={16} aria-hidden="true" />
      </button>
    </div>
  );
}

/** The day grid, printed in pixel type straight on the popover's e-ink surface. */
function DayGrid(props: TableHTMLAttributes<HTMLTableElement>) {
  return (
    <div className="lcd-cal">
      <table {...props} />
    </div>
  );
}

interface MonthViewProps {
  shown: Date;
  bounds: Bounds;
  onPick: (month: Date) => void;
  onClose: () => void;
}

/** Twelve month keys of one year, the same height as the day grid; ‹ › change the year. */
function MonthView({ shown, bounds: { first, today }, onPick, onClose }: MonthViewProps) {
  const [year, setYear] = useState(shown.getFullYear());
  const captionRef = useRef<HTMLButtonElement>(null);
  const lo = monthIndex(first);
  const hi = monthIndex(today);
  // A year key that reaches the end turns disabled, which would drop focus; hand it to the caption key.
  const stepYear = (to: number) => {
    setYear(to);
    if (to <= first.getFullYear() || to >= today.getFullYear()) captionRef.current?.focus();
  };
  return (
    <div className="cal cal-months">
      <div className="rdp-month_caption">
        <button
          type="button"
          className="cal-key cal-step"
          aria-label="上一年"
          disabled={year <= first.getFullYear()}
          onClick={() => stepYear(year - 1)}
        >
          <ChevronLeft size={16} aria-hidden="true" />
        </button>
        <button ref={captionRef} type="button" className="cal-key cal-caption" aria-expanded={true} aria-label={`${year}年，返回日历`} onClick={onClose}>
          <span className="rdp-caption_label">{year}年</span>
          <ChevronDown size={14} aria-hidden="true" className="is-flipped" />
        </button>
        <button
          type="button"
          className="cal-key cal-step"
          aria-label="下一年"
          disabled={year >= today.getFullYear()}
          onClick={() => stepYear(year + 1)}
        >
          <ChevronRight size={16} aria-hidden="true" />
        </button>
      </div>
      <div className="cal-month-grid lcd-months" role="group" aria-label={`${year}年`}>
        {Array.from({ length: 12 }, (_, month) => {
          const index = year * 12 + month;
          const current = index === monthIndex(shown);
          return (
            <button
              key={month}
              type="button"
              className={`cal-month${current ? " is-current" : ""}`}
              disabled={index < lo || index > hi}
              aria-pressed={current}
              // The current month takes focus, so the keyboard lands where the day view was.
              autoFocus={current}
              onClick={() => onPick(new Date(year, month, 1))}
            >
              {month + 1}月
            </button>
          );
        })}
      </div>
    </div>
  );
}

type SharedProps = PropsBase & { className: string };

interface FrameProps {
  initialMonth: Date;
  today: string;
  dataStartDate: string | null;
  /** Renders the day view from the props both calendars share. */
  children: (shared: SharedProps) => JSX.Element;
}

/** Shown month, the month view and the DayPicker props both calendars share. */
function CalendarFrame({ initialMonth, today, dataStartDate, children }: FrameProps) {
  const range = useMemo(() => bounds(today, dataStartDate), [today, dataStartDate]);
  const [month, setMonth] = useState(() => startOfMonth(initialMonth));
  const [view, setView] = useState<"days" | "months">("days");

  const caption = useMemo<CaptionState>(
    () => ({ openMonths: () => setView("months"), firstMonth: startOfMonth(range.first), lastMonth: startOfMonth(range.today) }),
    [range.first, range.today],
  );

  if (view === "months") {
    return (
      <MonthView
        shown={month}
        bounds={range}
        onPick={(picked) => {
          setMonth(picked);
          setView("days");
        }}
        onClose={() => setView("days")}
      />
    );
  }

  const disabled: Matcher[] = [{ after: range.today }, { before: range.first }];

  const shared: SharedProps = {
    className: "cal",
    month,
    onMonthChange: setMonth,
    locale: zhCN,
    weekStartsOn: 1,
    today: range.today,
    startMonth: new Date(range.first.getFullYear(), range.first.getMonth() - 1, 1),
    endMonth: new Date(range.today.getFullYear(), range.today.getMonth() + 1, 1),
    disabled,
    hideNavigation: true,
    showOutsideDays: true,
    fixedWeeks: true,
    autoFocus: true,
    components: { MonthCaption: CaptionKeys, MonthGrid: DayGrid },
    formatters: {
      formatCaption: monthCaption,
      formatWeekdayName: (date: Date) => WEEKDAYS[date.getDay()],
      formatDay: (date: Date) => String(date.getDate()),
    },
  };

  return <CaptionContext.Provider value={caption}>{children(shared)}</CaptionContext.Provider>;
}

interface CalendarDataProps {
  /** Local date, `YYYY-MM-DD`. */
  today: string;
  /** The first day with records, or `null` before the first record. */
  dataStartDate: string | null;
}

interface DayCalendarProps extends CalendarDataProps {
  /** Local date, `YYYY-MM-DD`. */
  selected: string;
  onSelect: (date: string) => void;
}

export function DayCalendar({ selected, onSelect, ...data }: DayCalendarProps) {
  const selectedDate = parseLocalDate(selected) ?? parseLocalDate(data.today) ?? new Date();
  return (
    <CalendarFrame initialMonth={selectedDate} {...data}>
      {(shared) => (
        <DayPicker {...shared} mode="single" required selected={selectedDate} onSelect={(date) => onSelect(formatLocalDate(date))} />
      )}
    </CalendarFrame>
  );
}

interface RangeCalendarProps extends CalendarDataProps {
  range: DateRange;
  /** Called once both ends are picked (two clicks), the earlier day first. */
  onSelect: (range: DateRange) => void;
}

/** Two clicks pick a range: the first sets one end (shown alone), the second the other. */
export function RangeCalendar({ range, onSelect, ...data }: RangeCalendarProps) {
  const [anchor, setAnchor] = useState<Date | null>(null);
  const from = parseLocalDate(range.start) ?? undefined;
  const to = parseLocalDate(range.end) ?? undefined;
  return (
    <CalendarFrame initialMonth={to ?? parseLocalDate(data.today) ?? new Date()} {...data}>
      {(shared) => (
        <DayPicker
          {...shared}
          className={`${shared.className} cal-range`}
          mode="range"
          selected={anchor ? { from: anchor, to: undefined } : { from, to }}
          onSelect={() => {}}
          onDayClick={(date, modifiers) => {
            if (modifiers.disabled) return;
            if (!anchor) {
              setAnchor(date);
              return;
            }
            setAnchor(null);
            const [start, end] = date < anchor ? [date, anchor] : [anchor, date];
            onSelect({ start: formatLocalDate(start), end: formatLocalDate(end) });
          }}
        />
      )}
    </CalendarFrame>
  );
}
