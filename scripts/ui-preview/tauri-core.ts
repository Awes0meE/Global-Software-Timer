// Browser-only stand-in for @tauri-apps/api/core used by `npm run preview:ui`.
import type { HeatmapDays } from "../../src/api";
import {
  achievementsSummary,
  backgroundSummary,
  calendarSummary,
  dashboardSummary,
  emptyAchievementsSummary,
  emptyCalendarSummary,
  emptyStatisticsSummary,
  pastBackgroundSummary,
  pastDashboardSummary,
  softwareSummary,
  statisticsSummary,
  viewedPastDay,
} from "./mock-data";
import { exportCommand } from "./mock-exports";

const params = new URLSearchParams(window.location.search);
const empty = params.has("empty");
const focused = new Set<string>(empty ? [] : ["code", "excel", "typora", "matlab"]);
const hidden = new Set<string>(empty ? [] : ["onedrive", "snipaste"]);
const settings: Record<string, unknown> = {
  close_behavior: "minimize_to_tray",
  close_behavior_configured: true,
  autostart_enabled: true,
  autostart_configured: true,
  duration_format: params.get("format") === "hm" ? "hours_minutes" : "decimal_hours",
  duration_format_configured: true,
  theme: params.get("theme") ?? "system",
  theme_configured: params.has("theme"),
};
// ?tick: each dashboard poll adds another 6 minutes to today's two readings (0, 6, 12, ... minutes), so the
// shown value changes on every poll and the readout ghost can be seen. Ignored with ?empty.
const tick = params.has("tick") && !empty;
let dashboardCalls = 0;

export async function invoke<T>(command: string, args: Record<string, unknown> = {}): Promise<T> {
  await new Promise((resolve) => window.setTimeout(resolve, 60));
  const keys = (args.identityKeys as string[] | undefined) ?? [];
  const key = args.identityKey as string | undefined;

  switch (command) {
    case "get_dashboard_summary": {
      const pastDay = viewedPastDay(args.date);
      if (pastDay !== null) {
        return pastDashboardSummary(hidden, pastDay, empty) as T;
      }
      if (empty) {
        return { ...dashboardSummary(hidden), apps: [], most_used: null, recorded_today_seconds: 0, active_today_seconds: 0 } as T;
      }
      const summary = dashboardSummary(hidden);
      const extra = tick ? dashboardCalls++ * 360 : 0;
      return {
        ...summary,
        recorded_today_seconds: summary.recorded_today_seconds + extra,
        active_today_seconds: summary.active_today_seconds + extra,
      } as T;
    }
    case "get_background_page_summary": {
      const pastDay = viewedPastDay(args.date);
      if (pastDay !== null) {
        return pastBackgroundSummary(pastDay, empty) as T;
      }
      const summary = backgroundSummary();
      return (empty ? { ...summary, running_count: 0, rows: [] } : summary) as T;
    }
    case "get_calendar_summary":
      return (empty ? emptyCalendarSummary() : calendarSummary()) as T;
    case "get_software_page_summary":
      return (empty ? { focused: [], hidden: [], discovered: [] } : softwareSummary(focused, hidden)) as T;
    case "get_statistics_summary": {
      const start = args.start as string;
      const end = args.end as string;
      return (empty ? emptyStatisticsSummary(start, end) : statisticsSummary(start, end, args.includeHidden === true, hidden)) as T;
    }
    case "get_achievements_summary": {
      const heatmapDays = args.heatmapDays as HeatmapDays;
      return (empty ? emptyAchievementsSummary(heatmapDays) : achievementsSummary(heatmapDays, args.includeHidden === true, hidden)) as T;
    }
    case "add_focused_software_identities":
      keys.forEach((item) => focused.add(item));
      return undefined as T;
    case "remove_focused_software_identity":
      if (key) focused.delete(key);
      return undefined as T;
    case "add_hidden_software_identities":
      keys.forEach((item) => hidden.add(item));
      return undefined as T;
    case "remove_hidden_software_identity":
      if (key) hidden.delete(key);
      return undefined as T;
    case "get_app_settings":
      return { ...settings } as T;
    case "set_close_behavior_preference":
      settings.close_behavior = args.choice;
      return undefined as T;
    case "set_autostart_preference":
      settings.autostart_enabled = args.enabled;
      return undefined as T;
    case "set_duration_format_preference":
      settings.duration_format = args.durationFormat;
      return undefined as T;
    case "set_theme_preference":
      settings.theme = args.theme;
      settings.theme_configured = true;
      return undefined as T;
    case "get_close_behavior_preference":
      return settings.close_behavior as T;
    case "get_transparency_effects_enabled":
      return (params.get("glass") !== "off") as T;
    case "apply_window_close_choice":
      return undefined as T;
    default: {
      const exported = exportCommand(command, args, { settings, focused, hidden });
      if (exported) return exported.value as T;
      throw new Error(`preview mock: unknown command ${command}`);
    }
  }
}

// ?page=software|background|statistics|achievements|settings opens that page after the first render;
// ?dialog=add|close opens a dialog.
const pageLabels: Record<string, string> = {
  software: "软件",
  background: "后台",
  statistics: "统计",
  achievements: "成就",
  settings: "设置",
};
const targetPage = pageLabels[params.get("page") ?? ""];
const targetDialog = params.get("dialog");

function clickWhenReady(find: () => HTMLElement | undefined, attempts = 40) {
  const element = find();
  if (element) {
    element.click();
  } else if (attempts > 0) {
    window.setTimeout(() => clickWhenReady(find, attempts - 1), 100);
  }
}

const buttonByText = (text: string) => () =>
  Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find(
    (button) => button.textContent?.trim() === text,
  );

if (targetPage) {
  clickWhenReady(buttonByText(targetPage));
}

if (targetDialog === "add") {
  window.setTimeout(() => clickWhenReady(() => document.querySelector<HTMLElement>(".panel-add-button") ?? undefined), 400);
}
