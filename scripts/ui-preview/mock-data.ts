// Synthetic demo data for the browser-only UI preview. Not real usage records.
import type {
  AchievementsSummary,
  AppUsageRow,
  BackgroundPageSummary,
  DashboardSummary,
  HeatmapDays,
  IdleOpenRow,
  MilestoneRow,
  RankingRow,
  SessionStatRow,
  SoftwarePageRow,
  SoftwarePageSummary,
  SoftwareRef,
  StatisticsDay,
  StatisticsSummary,
} from "../../src/api";

function tile(letter: string, background: string, foreground = "#ffffff"): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="${background}"/><text x="32" y="43" font-family="Segoe UI, Arial" font-size="30" font-weight="700" text-anchor="middle" fill="${foreground}">${letter}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

// Real app icons for README screenshots. They are third-party artwork, so they are not committed:
// `node scripts/ui-preview/collect-demo-icons.mjs` copies them from the local GST icon cache into
// ./demo-icons/ (gitignored). Without them the preview falls back to the letter tiles.
const demoIcons = import.meta.glob<string>("./demo-icons/*.png", { eager: true, query: "?url", import: "default" });

function icon(key: string, fallback: string | null): string | null {
  return demoIcons[`./demo-icons/${key}.png`] ?? fallback;
}

const hour = 3600;

function hoursAgo(hours: number): string {
  return new Date(Date.now() - hours * hour * 1000).toISOString();
}

// The demo day is 11.7 hours long; scale it to the time that has actually passed today so totals
// never exceed the elapsed day shown on the LCD dial.
function dayScale(): number {
  const now = new Date();
  const elapsedHours = now.getHours() + now.getMinutes() / 60;
  return Math.min(1, elapsedHours / 11.7);
}

// Today's full-day totals, shared by the dashboard and today's statistics/achievements entry.
const DEMO_RECORDED_TODAY = 9.6 * hour;
const DEMO_ACTIVE_TODAY = 6.3 * hour;

interface Seed {
  key: string;
  name: string;
  process: string;
  icon: string | null;
  total: number;
  today: number;
  active: number;
  status: AppUsageRow["status"];
  lastOpened: string | null;
}

const seeds: Seed[] = [
  { key: "code", name: "Visual Studio Code", process: "Code.exe", icon: icon("code", tile("VS", "#1f6fb2")), total: 412.6 * hour, today: 5.4 * hour, active: 2.4 * hour, status: "foreground", lastOpened: hoursAgo(0.3) },
  { key: "chrome", name: "Google Chrome", process: "chrome.exe", icon: icon("chrome", tile("G", "#e8eaed", "#1a73e8")), total: 388.2 * hour, today: 4.1 * hour, active: 1.5 * hour, status: "foreground", lastOpened: hoursAgo(0.6) },
  { key: "wechat", name: "微信", process: "Weixin.exe", icon: icon("wechat", tile("微", "#07c160")), total: 201.4 * hour, today: 6.2 * hour, active: 0.4 * hour, status: "tray", lastOpened: hoursAgo(1.4) },
  { key: "excel", name: "Microsoft Excel", process: "EXCEL.EXE", icon: icon("excel", tile("X", "#107c41")), total: 96.3 * hour, today: 1.8 * hour, active: 0.7 * hour, status: "foreground", lastOpened: hoursAgo(0.1) },
  { key: "typora", name: "Typora", process: "Typora.exe", icon: icon("typora", tile("T", "#3f3f3f")), total: 74.9 * hour, today: 0.9 * hour, active: 0.2 * hour, status: "closed", lastOpened: hoursAgo(15) },
  { key: "steam", name: "Steam", process: "steam.exe", icon: icon("steam", tile("S", "#1b2838")), total: 61.5 * hour, today: 0.4 * hour, active: 0.03 * hour, status: "background", lastOpened: hoursAgo(40) },
  { key: "matlab", name: "MATLAB", process: "MATLAB.exe", icon: icon("matlab", tile("M", "#c4581b")), total: 48.7 * hour, today: 0, active: 0, status: "closed", lastOpened: hoursAgo(70) },
  { key: "notion", name: "Notion", process: "Notion.exe", icon: icon("notion", tile("N", "#191919")), total: 33.2 * hour, today: 0.7 * hour, active: 0.3 * hour, status: "closed", lastOpened: hoursAgo(20) },
  { key: "terminal", name: "Windows Terminal", process: "WindowsTerminal.exe", icon: icon("terminal", tile(">_", "#2b2b2b")), total: 22.8 * hour, today: 1.2 * hour, active: 0.5 * hour, status: "foreground", lastOpened: hoursAgo(0.2) },
  { key: "cloudmusic", name: "网易云音乐", process: "cloudmusic.exe", icon: icon("cloudmusic", null), total: 18.1 * hour, today: 2.3 * hour, active: 0.05 * hour, status: "background", lastOpened: hoursAgo(1.0) },
  { key: "snipaste", name: "Snipaste", process: "Snipaste.exe", icon: icon("snipaste", tile("S", "#2f6fdf")), total: 3.4 * hour, today: 0.1 * hour, active: 0.01 * hour, status: "background", lastOpened: hoursAgo(2.5) },
  { key: "onedrive", name: "OneDrive", process: "OneDrive.exe", icon: icon("onedrive", tile("☁", "#0f6cbd")), total: 120.0 * hour, today: 6.0 * hour, active: 0, status: "background", lastOpened: hoursAgo(3.2) },
];

export function dashboardSummary(hidden: Set<string>): DashboardSummary {
  const k = dayScale();
  const apps: AppUsageRow[] = seeds
    .filter((seed) => !hidden.has(seed.key))
    .map((seed, index) => ({
      app_id: index + 1,
      display_name: seed.name,
      process_name: seed.process,
      icon_url: seed.icon,
      total_seconds: seed.total,
      today_seconds: seed.today * k,
      active_today_seconds: seed.active * k,
      status: seed.status,
      is_running: seed.status !== "closed",
    }))
    .sort((left, right) => right.total_seconds - left.total_seconds);

  return {
    last_scan_succeeded: true,
    product_title: "全局软件计时器",
    locale: "zh-CN",
    most_used: apps[0] ?? null,
    recorded_today_seconds: DEMO_RECORDED_TODAY * k,
    active_today_seconds: DEMO_ACTIVE_TODAY * k,
    apps,
  };
}

export function softwareSummary(focused: Set<string>, hidden: Set<string>): SoftwarePageSummary {
  const k = dayScale();
  const rows: SoftwarePageRow[] = seeds.map((seed) => ({
    identity_key: seed.key,
    display_name: seed.name,
    process_name: seed.process,
    icon_url: seed.icon,
    today_runtime_seconds: seed.today * k,
    today_focused_seconds: seed.active * k,
    total_runtime_seconds: seed.total,
    total_focused_seconds: seed.total * 0.55,
    today_foreground_seconds: seed.today * k * 0.8,
    today_background_seconds: seed.today * k * 0.2,
    total_foreground_seconds: seed.total * 0.8,
    total_background_seconds: seed.total * 0.2,
    last_opened_at: seed.lastOpened,
    status: seed.status,
    mark: hidden.has(seed.key) ? "hidden" : focused.has(seed.key) ? "focused" : "none",
  }));

  return {
    focused: rows.filter((row) => row.mark === "focused"),
    hidden: rows.filter((row) => row.mark === "hidden"),
    discovered: [...rows].sort((left, right) =>
      (right.last_opened_at ?? "").localeCompare(left.last_opened_at ?? ""),
    ),
  };
}

export const backgroundSummary: BackgroundPageSummary = {
  logical_cores: 8,
  running_count: 3,
  rows: [
    {
      family_key: "sync-helper",
      display_name: "Sync Helper",
      process_name: "sync-helper.exe",
      icon_url: null,
      is_running: true,
      process_count: 2,
      cpu_percent: 0.8,
      memory_bytes: 48 * 1024 * 1024,
      today_running_seconds: 5400,
      today_cpu_seconds: 90,
    },
    {
      family_key: "index-service",
      display_name: "Index Service",
      process_name: "index-service.exe",
      icon_url: null,
      is_running: true,
      process_count: 1,
      cpu_percent: 2.4,
      memory_bytes: 310 * 1024 * 1024,
      today_running_seconds: 12600,
      today_cpu_seconds: 45,
    },
    {
      family_key: "update-agent",
      display_name: "Update Agent",
      process_name: "update-agent.exe",
      icon_url: null,
      is_running: false,
      process_count: 1,
      cpu_percent: null,
      memory_bytes: 1.4 * 1024 * 1024 * 1024,
      today_running_seconds: 900,
      today_cpu_seconds: 12,
    },
    {
      family_key: "license-daemon",
      display_name: "License Daemon",
      process_name: "license-daemon.exe",
      icon_url: null,
      is_running: true,
      process_count: 3,
      cpu_percent: 0.05,
      memory_bytes: 22 * 1024 * 1024,
      today_running_seconds: 28800,
      today_cpu_seconds: 4,
    },
  ],
};

// ---------------------------------------------------------------------------
// Statistics and achievements: a synthetic history counted back from today.
// Every number comes from a fixed-seed hash of the day offset, so a refresh
// shows the same data. Rules mirror src-tauri/src/statistics.rs.

const DAY_MS = 24 * 60 * 60 * 1000;
const DATA_START_OFFSET = 176; // recording started 176 days ago
const SOFTWARE_DETAIL_OFFSET = 156; // per-software detail starts 20 days later
const STREAK_BREAK_OFFSET = 12; // an unused day, so the current streak is 12 days
const MAX_RANGE_DAYS = 366;
const IDLE_OPEN_MIN_WINDOW_SECONDS = 5 * hour;
const IDLE_OPEN_MAX_FOCUS_PERMILLE = 50;
const MILESTONE_HOURS = [10, 50, 100, 500, 1000, 6666];
const STREAK_MIN_ACTIVE_SECONDS = 5 * 60;
const COMINGS_GOINGS_DAYS = 30;
const HEATMAP_DAY_OPTIONS = [90, 180, 365];
const RANKING_LIMIT = 20;

/** Deterministic value in [0, 1) for a label (FNV-1a hash, mulberry32 mix). */
function noise(label: string): number {
  let hash = 2166136261;
  for (let index = 0; index < label.length; index += 1) {
    hash = Math.imul(hash ^ label.charCodeAt(index), 16777619);
  }
  hash = Math.imul(hash ^ (hash >>> 15), hash | 1);
  hash ^= hash + Math.imul(hash ^ (hash >>> 7), hash | 61);
  return ((hash ^ (hash >>> 14)) >>> 0) / 4294967296;
}

/** Day numbers count days since 1970-01-01 for a local calendar date. */
function todayNumber(): number {
  const now = new Date();
  return Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / DAY_MS;
}

function parseDay(value: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]) - 1, Number(match[3])];
  const utc = new Date(Date.UTC(year, month, day));
  if (utc.getUTCFullYear() !== year || utc.getUTCMonth() !== month || utc.getUTCDate() !== day) return null;
  return utc.getTime() / DAY_MS;
}

// The Date is UTC midnight of the day number, so its ISO date is that calendar day.
const dateOf = (day: number) => new Date(day * DAY_MS).toISOString().slice(0, 10);
const isWeekend = (day: number) => [0, 6].includes((day + 4) % 7); // day 0 was a Thursday

function dayNumbers(first: number, last: number): number[] {
  return Array.from({ length: Math.max(0, last - first + 1) }, (_, index) => first + index);
}

/** RFC 3339 timestamp for a local wall-clock time on a day number. */
function localTimestamp(day: number, minutes: number): string {
  const utc = new Date(day * DAY_MS);
  return new Date(utc.getUTCFullYear(), utc.getUTCMonth(), utc.getUTCDate(), 0, minutes).toISOString();
}

interface MachineDay {
  recorded: number;
  active: number;
  uptime: number;
  firstMinute: number; // local minutes since midnight
  lastMinute: number;
  share: number; // part of the day that has passed: 1 for past days, dayScale() for today
}

function machineDay(today: number, day: number): MachineDay | null {
  const offset = today - day;
  // Random unused days stay clear of the current streak and of the data and detail start days.
  const unused =
    offset === STREAK_BREAK_OFFSET ||
    (offset > STREAK_BREAK_OFFSET && offset < SOFTWARE_DETAIL_OFFSET && noise(`off:${offset}`) < 0.1);
  if (offset < 0 || offset > DATA_START_OFFSET || unused) return null;
  const firstMinute = 8 * 60 + Math.round(90 * noise(`first:${offset}`));
  if (offset === 0) return todaySoFar(firstMinute);
  const active = Math.round((4.5 + 3 * noise(`active:${offset}`)) * hour * (isWeekend(day) ? 0.55 : 1));
  const recorded = Math.round(active * (1.25 + 0.3 * noise(`recorded:${offset}`)));
  const uptime = recorded + Math.round((0.5 + noise(`uptime:${offset}`)) * hour);
  return { recorded, active, uptime, firstMinute, lastMinute: firstMinute + Math.round(uptime / 60), share: 1 };
}

/**
 * Today is still in progress: it uses the dashboard's totals scaled by dayScale(), so it matches the
 * dashboard preview, never exceeds the time that has passed, and its last record is not after now.
 */
function todaySoFar(plannedFirstMinute: number): MachineDay | null {
  const now = new Date();
  const elapsedMinutes = now.getHours() * 60 + now.getMinutes();
  const share = dayScale();
  const recorded = Math.round(DEMO_RECORDED_TODAY * share);
  const active = Math.round(DEMO_ACTIVE_TODAY * share);
  if (recorded === 0) return null;
  const uptime = Math.min(recorded + Math.round(0.8 * hour * share), elapsedMinutes * 60);
  const uptimeMinutes = Math.ceil(uptime / 60);
  const lastMinute = Math.min(elapsedMinutes, plannedFirstMinute + uptimeMinutes);
  const firstMinute = Math.min(plannedFirstMinute, lastMinute - uptimeMinutes);
  return { recorded, active, uptime, firstMinute, lastMinute, share };
}

interface SoftwareModel {
  key: string;
  focusShare: number; // share of the machine's active time
  windowHours: number; // typical taskbar-window hours per day
  launchesPerDay: number;
  firstOffset?: number; // first day with a window, counted back from today
  lastOffset?: number; // last day with a window, counted back from today
  // Focus multiplier that changes `sinceOffset` days ago, so ranks move in the 7- and 30-day ranges.
  trend?: { sinceOffset: number; recent: number; earlier: number };
}

const softwareModels: SoftwareModel[] = [
  { key: "code", focusShare: 0.3, windowHours: 7, launchesPerDay: 2 },
  { key: "chrome", focusShare: 0.22, windowHours: 6, launchesPerDay: 3, trend: { sinceOffset: 10, recent: 0.6, earlier: 1.3 } },
  { key: "excel", focusShare: 0.12, windowHours: 3, launchesPerDay: 2, trend: { sinceOffset: 10, recent: 1.8, earlier: 0.7 } },
  { key: "notion", focusShare: 0.08, windowHours: 2, launchesPerDay: 1, firstOffset: 5 },
  { key: "typora", focusShare: 0.06, windowHours: 2, launchesPerDay: 1, trend: { sinceOffset: 30, recent: 1.3, earlier: 0.1 } },
  { key: "terminal", focusShare: 0.05, windowHours: 1.5, launchesPerDay: 3, firstOffset: 18 },
  { key: "steam", focusShare: 0.03, windowHours: 1, launchesPerDay: 1, lastOffset: 45 },
  { key: "matlab", focusShare: 0.03, windowHours: 1.5, launchesPerDay: 1, lastOffset: 38 },
  { key: "wechat", focusShare: 0.02, windowHours: 9, launchesPerDay: 1 }, // open all day, rarely used
  { key: "snipaste", focusShare: 0.01, windowHours: 6, launchesPerDay: 1 },
  { key: "cloudmusic", focusShare: 0.005, windowHours: 5, launchesPerDay: 1 },
];

function visibleModels(includeHidden: boolean, hidden: Set<string>): SoftwareModel[] {
  return softwareModels.filter((model) => includeHidden || !hidden.has(model.key));
}

function softwareDay(model: SoftwareModel, today: number, day: number): { window: number; focus: number } | null {
  const offset = today - day;
  const machine = machineDay(today, day);
  if (
    !machine ||
    offset > SOFTWARE_DETAIL_OFFSET ||
    offset > (model.firstOffset ?? SOFTWARE_DETAIL_OFFSET) ||
    offset < (model.lastOffset ?? 0)
  ) {
    return null;
  }
  const trend = !model.trend ? 1 : offset < model.trend.sinceOffset ? model.trend.recent : model.trend.earlier;
  const window = Math.min(
    machine.uptime,
    Math.round(
      model.windowHours * hour * (0.7 + 0.6 * noise(`window:${model.key}:${offset}`)) * (isWeekend(day) ? 0.6 : 1) * machine.share,
    ),
  );
  const focus = Math.round(model.focusShare * machine.active * trend * (0.6 + 0.8 * noise(`focus:${model.key}:${offset}`)));
  return { window, focus: Math.min(window, focus) };
}

const seedByKey = new Map(seeds.map((seed) => [seed.key, seed]));

function identity(key: string) {
  const seed = seedByKey.get(key);
  return { identity_key: key, display_name: seed?.name ?? key, icon_url: seed?.icon ?? null };
}

function compareNames(left: string, right: string): number {
  const [a, b] = [identity(left).display_name, identity(right).display_name];
  return a < b ? -1 : a > b ? 1 : 0;
}

interface SoftwareTotals {
  key: string;
  focus: number;
  window: number;
  launches: number;
  longest: number;
}

/** Per-software sums over a range, ordered by focus like the backend ranking. */
function softwareTotals(models: SoftwareModel[], today: number, first: number, last: number): SoftwareTotals[] {
  return models
    .map((model) => {
      const totals = { key: model.key, focus: 0, window: 0, launches: 0, longest: 0 };
      for (const day of dayNumbers(first, last)) {
        const usage = softwareDay(model, today, day);
        if (!usage) continue;
        totals.focus += usage.focus;
        totals.window += usage.window;
        totals.launches += model.launchesPerDay;
        totals.longest = Math.max(totals.longest, Math.round(usage.window / model.launchesPerDay));
      }
      return totals;
    })
    .filter((totals) => totals.focus > 0 || totals.window > 0)
    .sort((left, right) => right.focus - left.focus || compareNames(left.key, right.key));
}

function parseRange(start: string, end: string): { first: number; last: number } {
  const first = parseDay(start);
  const last = parseDay(end);
  if (first === null || last === null || first > last || last - first + 1 > MAX_RANGE_DAYS) {
    throw new Error("statistics_invalid_range");
  }
  return { first, last };
}

/** `hidden` is the preview's live hidden-software set, like dashboardSummary(hidden). */
export function statisticsSummary(
  start: string,
  end: string,
  includeHidden: boolean,
  hidden: Set<string>,
): StatisticsSummary {
  const { first, last } = parseRange(start, end);
  const today = todayNumber();
  const dataStart = today - DATA_START_OFFSET;
  const detailStart = today - SOFTWARE_DETAIL_OFFSET;
  const count = last - first + 1;
  const previousFirst = first - count;
  const softwareComparable = previousFirst >= detailStart;

  const days: StatisticsDay[] = dayNumbers(first, last).map((day) => {
    const machine = machineDay(today, day);
    const detail = day >= detailStart;
    return {
      date: dateOf(day),
      recorded_seconds: machine?.recorded ?? 0,
      active_seconds: machine?.active ?? 0,
      tracker_uptime_seconds: machine?.uptime ?? 0,
      first_recorded_at: machine && detail ? localTimestamp(day, machine.firstMinute) : null,
      last_recorded_at: machine && detail ? localTimestamp(day, machine.lastMinute) : null,
      has_software_detail: detail,
    };
  });
  const previousMachine = dayNumbers(previousFirst, first - 1).map((day) => machineDay(today, day));

  const models = visibleModels(includeHidden, hidden);
  const current = softwareTotals(models, today, first, last);
  const previous = softwareTotals(models, today, previousFirst, first - 1);
  const previousRanks = new Map(previous.map((totals, index) => [totals.key, index + 1]));
  const previousFocus = new Map(previous.map((totals) => [totals.key, totals.focus]));

  const ranking: RankingRow[] = current.slice(0, RANKING_LIMIT).map((totals, index) => {
    const previousRank = softwareComparable ? previousRanks.get(totals.key) ?? null : null;
    return {
      ...identity(totals.key),
      rank: index + 1,
      previous_rank: previousRank,
      is_new: softwareComparable && previousRank === null,
      focused_seconds: totals.focus,
      previous_focused_seconds: previousFocus.get(totals.key) ?? 0,
      window_seconds: totals.window,
    };
  });

  const idleOpen: IdleOpenRow[] = current
    .filter(
      (totals) =>
        totals.window >= IDLE_OPEN_MIN_WINDOW_SECONDS &&
        totals.focus * 1000 < totals.window * IDLE_OPEN_MAX_FOCUS_PERMILLE,
    )
    .map((totals) => ({
      ...identity(totals.key),
      window_seconds: totals.window,
      focused_seconds: totals.focus,
      idle_seconds: totals.window - totals.focus,
    }))
    .sort((left, right) => right.idle_seconds - left.idle_seconds);

  const sessions: SessionStatRow[] = current
    .filter((totals) => totals.launches > 0)
    .sort((left, right) => right.launches - left.launches || compareNames(left.key, right.key))
    .slice(0, RANKING_LIMIT)
    .map((totals) => ({
      ...identity(totals.key),
      launch_count: totals.launches,
      average_seconds: Math.round(totals.window / totals.launches),
      longest_seconds: totals.longest,
    }));

  return {
    start,
    end,
    days_count: count,
    previous_start: dateOf(previousFirst),
    previous_end: dateOf(first - 1),
    data_start_date: dateOf(dataStart),
    software_detail_start_date: dateOf(detailStart),
    days_without_software_detail: days.filter((day) => !day.has_software_detail).length,
    system_comparison_available: previousFirst >= dataStart,
    software_comparison_available: softwareComparable,
    previous_recorded_seconds: previousMachine.reduce((sum, machine) => sum + (machine?.recorded ?? 0), 0),
    previous_active_seconds: previousMachine.reduce((sum, machine) => sum + (machine?.active ?? 0), 0),
    days,
    ranking,
    idle_open: idleOpen,
    sessions,
  };
}

export function emptyStatisticsSummary(start: string, end: string): StatisticsSummary {
  const { first, last } = parseRange(start, end);
  const count = last - first + 1;
  return {
    start,
    end,
    days_count: count,
    previous_start: dateOf(first - count),
    previous_end: dateOf(first - 1),
    data_start_date: null,
    software_detail_start_date: null,
    days_without_software_detail: count,
    system_comparison_available: false,
    software_comparison_available: false,
    previous_recorded_seconds: 0,
    previous_active_seconds: 0,
    days: dayNumbers(first, last).map((day) => ({
      date: dateOf(day),
      recorded_seconds: 0,
      active_seconds: 0,
      tracker_uptime_seconds: 0,
      first_recorded_at: null,
      last_recorded_at: null,
      has_software_detail: false,
    })),
    ranking: [],
    idle_open: [],
    sessions: [],
  };
}

// Focus totals are hand-picked so the shelf shows every state: a tier reached
// today (100 hours), no tier yet, and the 6666-hour ultimate tier (demo only).
const milestoneSeeds: { key: string; hours: number; reachedOffset: number | null }[] = [
  { key: "code", hours: 6702.4, reachedOffset: 2 },
  { key: "chrome", hours: 742.5, reachedOffset: 41 },
  { key: "excel", hours: 100.3, reachedOffset: 0 },
  { key: "typora", hours: 63.4, reachedOffset: 20 },
  { key: "matlab", hours: 55.1, reachedOffset: 63 },
  { key: "terminal", hours: 18.6, reachedOffset: 6 },
  { key: "snipaste", hours: 12.1, reachedOffset: 90 },
  { key: "notion", hours: 7.2, reachedOffset: null },
];

function checkHeatmapDays(heatmapDays: number) {
  if (!HEATMAP_DAY_OPTIONS.includes(heatmapDays)) {
    throw new Error("achievements_invalid_heatmap_days");
  }
}

interface Streak {
  days: number;
  start: number | null;
  end: number | null;
}

/** Longest run and the current run (counted from yesterday while today is still under the bar). */
function streaks(active: Map<number, number>, today: number): { current: Streak; longest: Streak } {
  const qualifies = (day: number) => (active.get(day) ?? 0) >= STREAK_MIN_ACTIVE_SECONDS;
  let longest: Streak = { days: 0, start: null, end: null };
  let runStart: number | null = null;
  for (const day of active.keys()) {
    if (!qualifies(day)) {
      runStart = null;
      continue;
    }
    runStart ??= day;
    if (day - runStart + 1 > longest.days) longest = { days: day - runStart + 1, start: runStart, end: day };
  }

  const currentEnd = qualifies(today) ? today : today - 1;
  let days = 0;
  while (qualifies(currentEnd - days)) days += 1;
  const current = days > 0 ? { days, start: currentEnd - days + 1, end: currentEnd } : { days: 0, start: null, end: null };
  return { current, longest };
}

/** `hidden` is the preview's live hidden-software set, like dashboardSummary(hidden). */
export function achievementsSummary(
  heatmapDays: HeatmapDays,
  includeHidden: boolean,
  hidden: Set<string>,
): AchievementsSummary {
  checkHeatmapDays(heatmapDays);
  const today = todayNumber();
  const history = dayNumbers(today - DATA_START_OFFSET, today);
  const active = new Map(history.map((day) => [day, machineDay(today, day)?.active ?? 0]));
  const { current, longest } = streaks(active, today);

  let bestActive: { day: number; seconds: number } | null = null;
  for (const [day, seconds] of active) {
    if (seconds > 0 && (!bestActive || seconds > bestActive.seconds)) bestActive = { day, seconds };
  }

  let bestSoftware: { key: string; day: number; seconds: number } | null = null;
  const newSoftware: SoftwareRef[] = [];
  const dormantSoftware: SoftwareRef[] = [];
  const detailStart = today - SOFTWARE_DETAIL_OFFSET;
  const recentStart = today - (COMINGS_GOINGS_DAYS - 1); // the last 30 days including today
  for (const model of visibleModels(includeHidden, hidden)) {
    const windowDays: number[] = [];
    for (const day of dayNumbers(detailStart, today)) {
      const usage = softwareDay(model, today, day);
      if (!usage) continue;
      windowDays.push(day);
      if (!bestSoftware || usage.focus > bestSoftware.seconds) bestSoftware = { key: model.key, day, seconds: usage.focus };
    }
    if (windowDays.length === 0) continue;
    const firstDay = windowDays[0];
    const lastDay = windowDays[windowDays.length - 1];
    // Software already present on the first day of detail is not new.
    if (firstDay > detailStart && firstDay >= recentStart) {
      newSoftware.push({ ...identity(model.key), date: dateOf(firstDay) });
    }
    if (lastDay < recentStart) {
      dormantSoftware.push({ ...identity(model.key), date: dateOf(lastDay) });
    }
  }
  const byDateDescending = (left: SoftwareRef, right: SoftwareRef) => right.date.localeCompare(left.date);

  const milestones: MilestoneRow[] = milestoneSeeds
    .filter((seed) => includeHidden || !hidden.has(seed.key))
    .map((seed) => {
      const reached = MILESTONE_HOURS.filter((tier) => tier <= seed.hours);
      return {
        ...identity(seed.key),
        focused_seconds: Math.round(seed.hours * hour),
        reached_hours: reached.length > 0 ? reached[reached.length - 1] : null,
        reached_on: seed.reachedOffset === null ? null : dateOf(today - seed.reachedOffset),
        next_hours: MILESTONE_HOURS.find((tier) => tier > seed.hours) ?? null,
      };
    })
    .sort((left, right) => right.focused_seconds - left.focused_seconds);

  return {
    today: dateOf(today),
    heatmap_days: heatmapDays,
    heatmap: dayNumbers(today - heatmapDays + 1, today).map((day) => ({ date: dateOf(day), active_seconds: active.get(day) ?? 0 })),
    streak_threshold_seconds: STREAK_MIN_ACTIVE_SECONDS,
    current_streak_days: current.days,
    current_streak_start: current.start === null ? null : dateOf(current.start),
    longest_streak_days: longest.days,
    longest_streak_start: longest.start === null ? null : dateOf(longest.start),
    longest_streak_end: longest.end === null ? null : dateOf(longest.end),
    best_active_day: bestActive ? { date: dateOf(bestActive.day), seconds: bestActive.seconds } : null,
    best_software_day: bestSoftware ? { ...identity(bestSoftware.key), date: dateOf(bestSoftware.day), seconds: bestSoftware.seconds } : null,
    milestone_hours: [...MILESTONE_HOURS],
    milestones,
    new_software: newSoftware.sort(byDateDescending),
    dormant_software: dormantSoftware.sort(byDateDescending),
  };
}

export function emptyAchievementsSummary(heatmapDays: HeatmapDays): AchievementsSummary {
  checkHeatmapDays(heatmapDays);
  const today = todayNumber();
  return {
    today: dateOf(today),
    heatmap_days: heatmapDays,
    heatmap: dayNumbers(today - heatmapDays + 1, today).map((day) => ({ date: dateOf(day), active_seconds: 0 })),
    streak_threshold_seconds: STREAK_MIN_ACTIVE_SECONDS,
    current_streak_days: 0,
    current_streak_start: null,
    longest_streak_days: 0,
    longest_streak_start: null,
    longest_streak_end: null,
    best_active_day: null,
    best_software_day: null,
    milestone_hours: [...MILESTONE_HOURS],
    milestones: [],
    new_software: [],
    dormant_software: [],
  };
}
