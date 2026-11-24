// View models for the share posters (spec v0.4.3 A and B): pure functions from the summaries the pages
// already read to the strings a poster draws. Posters show display names, icons, hours, days and dates
// only, never program paths or process names.
import type { AppUsageRow, DashboardSummary, MilestoneSoftware } from "../api";
import { formatDurationPartsZh } from "../i18n";

export type { MilestoneSoftware };

export type PosterTheme = "dark" | "light";

export interface DailyPosterColumn {
  key: string;
  name: string;
  icon: string | null;
  /** Hours with one decimal, e.g. "2.4". */
  hours: string;
}

export interface DailyPosterModel {
  /** "11月25日 周三" */
  dateText: string;
  /** 今日活跃 for today, 当日活跃 for a past day. */
  label: string;
  /** Active hours with one decimal, e.g. "6.3". */
  hero: string;
  /** Filled share of the bar: active ÷ recorded, clamped to 0–1 (0 when nothing was recorded). */
  share: number;
  /** Recorded hours with one decimal. */
  recorded: string;
  /** Top 3 software of the day, 0–3 columns. */
  columns: DailyPosterColumn[];
}

export interface AchievementPosterModel {
  key: string;
  name: string;
  icon: string | null;
  /** "2026年11月20日": the day the highest tier was reached. */
  dateText: string;
  /** The tier in hours, e.g. "6666". */
  tier: string;
  /** All-time days with at least 300 s of focus. */
  days: string;
  /** All-time focus hours with one decimal. */
  focus: string;
}

const WEEKDAYS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"] as const;

function parseIsoDate(iso: string): { year: number; month: number; day: number } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) {
    throw new Error(`poster: not a YYYY-MM-DD date: ${iso}`);
  }
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}

/** "2026-11-25" -> "11月25日 周三" (no leading zeros). */
export function formatPosterDay(iso: string): string {
  const { year, month, day } = parseIsoDate(iso);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return `${month}月${day}日 ${WEEKDAYS[weekday]}`;
}

/** "2026-11-20" -> "2026年11月20日". */
export function formatPosterFullDate(iso: string): string {
  const { year, month, day } = parseIsoDate(iso);
  return `${year}年${month}月${day}日`;
}

/** Decimal hours with one digit, rounded exactly as the app's own readings ("8.3"). */
export function formatPosterHours(seconds: number): string {
  return formatDurationPartsZh(seconds, "decimal_hours")[0].value;
}

const nameOrder = new Intl.Collator("zh-CN");

/**
 * The day's top 3 by active seconds (ties: runtime, then name). When no row has active time the tray
 * ranks and shows runtime instead. Rows with no time at all that day are left out.
 */
export function topDailySoftware(apps: readonly AppUsageRow[]): DailyPosterColumn[] {
  const used = apps.filter((app) => app.today_seconds > 0 || app.active_today_seconds > 0);
  const byRuntime = used.every((app) => app.active_today_seconds <= 0);
  const value = (app: AppUsageRow) => (byRuntime ? app.today_seconds : app.active_today_seconds);

  return [...used]
    .sort(
      (left, right) =>
        value(right) - value(left) ||
        right.today_seconds - left.today_seconds ||
        nameOrder.compare(left.display_name, right.display_name),
    )
    .slice(0, 3)
    .map((app) => ({
      key: `${app.app_id}`,
      name: app.display_name,
      icon: app.icon_url,
      hours: formatPosterHours(value(app)),
    }));
}

/**
 * 日报海报 for the day `summary` describes. `summary.apps` are the rows 概览 lists, hidden software
 * already left out by the backend.
 */
export function dailyPosterModel(summary: DashboardSummary, viewedDate: string, isToday: boolean): DailyPosterModel {
  const recorded = Math.max(0, summary.recorded_today_seconds);
  const active = Math.max(0, summary.active_today_seconds);
  const share = recorded > 0 ? Math.min(1, active / recorded) : 0;

  return {
    dateText: formatPosterDay(viewedDate),
    label: isToday ? "今日活跃" : "当日活跃",
    hero: formatPosterHours(active),
    share,
    recorded: formatPosterHours(recorded),
    columns: topDailySoftware(summary.apps),
  };
}

/** 成就海报 for one software's highest focus milestone. */
export function achievementPosterModel(software: MilestoneSoftware): AchievementPosterModel {
  return {
    key: software.identity_key,
    name: software.display_name,
    icon: software.icon_url,
    dateText: formatPosterFullDate(software.reached_on),
    tier: String(software.tier_hours),
    days: String(software.used_days),
    focus: formatPosterHours(software.total_focused_seconds),
  };
}

/** Swaps every icon URL in a model for its `data:` URL (or null), e.g. with `iconToDataUrl`. */
export async function withIcons<T extends { icon: string | null }>(
  items: readonly T[],
  toDataUrl: (url: string) => Promise<string | null>,
): Promise<T[]> {
  return Promise.all(items.map(async (item) => ({ ...item, icon: item.icon ? await toDataUrl(item.icon) : null })));
}
