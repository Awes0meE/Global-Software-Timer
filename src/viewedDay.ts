import { useEffect, useState } from "react";
import { DAY_INVALID_DATE } from "./api";
import { formatLocalDate } from "./statisticsRange";

/** Waits this long past midnight, so the timer never lands on the old day's last millisecond. */
const MIDNIGHT_MARGIN_MS = 1000;

/**
 * Today's local `YYYY-MM-DD`, moved on at midnight. A timer can fire late while the PC sleeps or the
 * window sits hidden, so the date is also checked again whenever the window shows.
 */
export function useLocalToday(): string {
  const [today, setToday] = useState(() => formatLocalDate(new Date()));

  useEffect(() => {
    let timer: number | undefined;
    const check = () => {
      window.clearTimeout(timer);
      const now = new Date();
      setToday(formatLocalDate(now));
      const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      timer = window.setTimeout(check, midnight.getTime() - now.getTime() + MIDNIGHT_MARGIN_MS);
    };
    check();
    document.addEventListener("visibilitychange", check);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", check);
    };
  }, []);

  return today;
}

/** The backend's answer to a malformed or future date; Tauri rejects with the bare error string. */
export function isDayInvalidDate(reason: unknown): boolean {
  return reason === DAY_INVALID_DATE || (reason instanceof Error && reason.message === DAY_INVALID_DATE);
}

/**
 * Whether a summary answers a request for `day` (null: today, live). A late answer for another day is
 * dropped, so a slow read never paints over the day the user moved to.
 */
export function answersDay(summary: { usage_date?: string; is_today?: boolean }, day: string | null): boolean {
  return day === null ? summary.is_today !== false : summary.usage_date === day;
}
