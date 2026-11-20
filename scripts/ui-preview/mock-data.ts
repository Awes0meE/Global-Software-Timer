// Synthetic demo data for the browser-only UI preview. Not real usage records.
import type { AppUsageRow, DashboardSummary, SoftwarePageRow, SoftwarePageSummary } from "../../src/api";

function tile(letter: string, background: string, foreground = "#ffffff"): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="${background}"/><text x="32" y="43" font-family="Segoe UI, Arial" font-size="30" font-weight="700" text-anchor="middle" fill="${foreground}">${letter}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
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
  { key: "code", name: "Visual Studio Code", process: "Code.exe", icon: tile("VS", "#1f6fb2"), total: 412.6 * hour, today: 5.4 * hour, active: 2.4 * hour, status: "foreground", lastOpened: hoursAgo(0.3) },
  { key: "chrome", name: "Google Chrome", process: "chrome.exe", icon: tile("G", "#e8eaed", "#1a73e8"), total: 388.2 * hour, today: 4.1 * hour, active: 1.5 * hour, status: "foreground", lastOpened: hoursAgo(0.6) },
  { key: "wechat", name: "微信", process: "WeChat.exe", icon: tile("微", "#07c160"), total: 201.4 * hour, today: 6.2 * hour, active: 0.4 * hour, status: "background", lastOpened: hoursAgo(1.4) },
  { key: "wps", name: "WPS Office", process: "wps.exe", icon: tile("W", "#d63b2f"), total: 96.3 * hour, today: 1.8 * hour, active: 0.7 * hour, status: "foreground", lastOpened: hoursAgo(0.1) },
  { key: "zotero", name: "Zotero", process: "zotero.exe", icon: tile("Z", "#b5262e"), total: 74.9 * hour, today: 0.9 * hour, active: 0.2 * hour, status: "closed", lastOpened: hoursAgo(15) },
  { key: "steam", name: "Steam", process: "steam.exe", icon: tile("S", "#1b2838"), total: 61.5 * hour, today: 0.4 * hour, active: 0.03 * hour, status: "background", lastOpened: hoursAgo(40) },
  { key: "matlab", name: "MATLAB", process: "MATLAB.exe", icon: tile("M", "#c4581b"), total: 48.7 * hour, today: 0, active: 0, status: "closed", lastOpened: hoursAgo(70) },
  { key: "obsidian", name: "Obsidian", process: "Obsidian.exe", icon: tile("O", "#6c3fc5"), total: 33.2 * hour, today: 0.7 * hour, active: 0.3 * hour, status: "closed", lastOpened: hoursAgo(20) },
  { key: "terminal", name: "Windows Terminal", process: "WindowsTerminal.exe", icon: tile(">_", "#2b2b2b"), total: 22.8 * hour, today: 1.2 * hour, active: 0.5 * hour, status: "foreground", lastOpened: hoursAgo(0.2) },
  { key: "qq-music", name: "QQ音乐", process: "QQMusic.exe", icon: null, total: 18.1 * hour, today: 2.3 * hour, active: 0.05 * hour, status: "background", lastOpened: hoursAgo(1.0) },
  { key: "everything", name: "Everything", process: "Everything.exe", icon: tile("E", "#f2a516", "#3a2600"), total: 3.4 * hour, today: 0.1 * hour, active: 0.01 * hour, status: "background", lastOpened: hoursAgo(2.5) },
  { key: "onedrive", name: "OneDrive", process: "OneDrive.exe", icon: tile("☁", "#0f6cbd"), total: 120.0 * hour, today: 6.0 * hour, active: 0, status: "background", lastOpened: hoursAgo(3.2) },
];

export function dashboardSummary(hidden: Set<string>): DashboardSummary {
  const k = dayScale();
  const apps: AppUsageRow[] = seeds
    .filter((seed) => !hidden.has(seed.key))
    .map((seed, index) => ({
      app_id: index + 1,
      display_name: seed.name,
      process_name: seed.process,
      icon_data_url: seed.icon,
      total_seconds: seed.total,
      today_seconds: seed.today * k,
      active_today_seconds: seed.active * k,
      status: seed.status,
      is_running: seed.status !== "closed",
    }))
    .sort((left, right) => right.total_seconds - left.total_seconds);

  return {
    product_title: "全局软件计时器",
    locale: "zh-CN",
    most_used: apps[0] ?? null,
    recorded_today_seconds: 9.6 * hour * k,
    active_today_seconds: 6.3 * hour * k,
    apps,
  };
}

export function softwareSummary(focused: Set<string>, hidden: Set<string>): SoftwarePageSummary {
  const k = dayScale();
  const rows: SoftwarePageRow[] = seeds.map((seed) => ({
    identity_key: seed.key,
    display_name: seed.name,
    process_name: seed.process,
    icon_data_url: seed.icon,
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
