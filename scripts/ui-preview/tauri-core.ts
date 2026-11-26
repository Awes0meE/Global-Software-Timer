// Browser-only stand-in for @tauri-apps/api/core used by `npm run preview:ui`.
import type { HeatmapDays } from "../../src/api";
import { ACCENT_IDS, EINK_IDS, START_PAGE_IDS } from "../../src/appearancePresets";
import {
  achievementsSummary,
  backgroundSummary,
  calendarSummary,
  dashboardSummary,
  emptyAchievementsSummary,
  emptyCalendarSummary,
  emptyStatisticsExport,
  emptyStatisticsSummary,
  milestoneSoftware,
  pastBackgroundSummary,
  pastDashboardSummary,
  softwareSummary,
  statisticsExport,
  statisticsSummary,
  viewedPastDay,
  withStressMilestones,
} from "./mock-data";
import { exportCommand, saveBinaryExport } from "./mock-exports";

const params = new URLSearchParams(window.location.search);
const empty = params.has("empty");
const focused = new Set<string>(empty ? [] : ["code", "excel", "typora", "matlab"]);
const hidden = new Set<string>(empty ? [] : ["onedrive", "snipaste"]);

// The values set_ui_preference accepts per key, default first, as the Rust enums in commands.rs.
const uiPreferenceValues: Record<string, readonly string[]> = {
  accent: ["blue", ...ACCENT_IDS.filter((id) => id !== "blue")],
  eink: EINK_IDS,
  week_start: ["monday", "sunday"],
  start_page: START_PAGE_IDS,
  reduce_motion: ["system", "reduce"],
};

// ?accent=<id> ?eink=<id> ?weekstart=sun ?startpage=<id> ?motion=reduce set the stored value; an unknown
// value stays the unchosen default. As in the app, ?startpage=<id> opens that page once settings load
// (§E), so probe.mjs, which waits for the page ?page names (概览 without it), must also be given
// ?page=<id>.
function uiPreference(key: string, value: string | null): Record<string, unknown> {
  const allowed = uiPreferenceValues[key];
  const chosen = value !== null && allowed.includes(value);
  return { [key]: chosen ? value : allowed[0], [`${key}_configured`]: chosen };
}

const settings: Record<string, unknown> = {
  close_behavior: "minimize_to_tray",
  close_behavior_configured: true,
  autostart_enabled: true,
  autostart_configured: true,
  duration_format: params.get("format") === "hm" ? "hours_minutes" : "decimal_hours",
  duration_format_configured: true,
  theme: params.get("theme") ?? "system",
  theme_configured: params.has("theme"),
  ...uiPreference("accent", params.get("accent")),
  ...uiPreference("eink", params.get("eink")),
  ...uiPreference("week_start", params.get("weekstart") === "sun" ? "sunday" : null),
  ...uiPreference("start_page", params.get("startpage")),
  ...uiPreference("reduce_motion", params.get("motion")),
};
// ?tick: each dashboard poll adds another 6 minutes to today's two readings (0, 6, 12, ... minutes), so the
// shown value changes on every poll and the readout ghost can be seen. Ignored with ?empty.
const tick = params.has("tick") && !empty;
let dashboardCalls = 0;
// ?milestones=30: pads the 成就海报 list to the approved 30-row stress frame (picker-30). Ignored with ?empty.
const stressMilestones = params.get("milestones") === "30" && !empty;

export async function invoke<T>(
  command: string,
  body: Record<string, unknown> | Uint8Array = {},
  options?: { headers?: HeadersInit },
): Promise<T> {
  await new Promise((resolve) => window.setTimeout(resolve, 60));
  if (command === "save_binary_export") return saveBinaryExport(body, options) as T;
  const args = body as Record<string, unknown>;
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
    case "get_statistics_export": {
      const start = args.start as string;
      const end = args.end as string;
      return (empty ? emptyStatisticsExport(start, end) : statisticsExport(start, end, args.includeHidden === true, hidden)) as T;
    }
    case "get_milestone_software":
      if (empty) return [] as T;
      return (stressMilestones
        ? withStressMilestones(milestoneSoftware(args.includeHidden === true, hidden))
        : milestoneSoftware(args.includeHidden === true, hidden)) as T;
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
    case "set_ui_preference": {
      const uiKey = String(args.key);
      const allowed = Object.prototype.hasOwnProperty.call(uiPreferenceValues, uiKey)
        ? uiPreferenceValues[uiKey]
        : null;
      if (allowed === null) throw "ui_preference_unknown_key";
      if (!allowed.includes(String(args.value))) throw "ui_preference_invalid_value";
      settings[uiKey] = args.value;
      settings[`${uiKey}_configured`] = true;
      return undefined as T;
    }
    case "get_close_behavior_preference":
      return settings.close_behavior as T;
    case "get_transparency_effects_enabled":
      return (params.get("glass") !== "off") as T;
    case "get_windows_accent":
      // AccentDark1 / AccentLight2 of the Windows default blue: the browser cannot read the real one.
      return { light: "#0067c0", dark: "#4cc2ff" } as T;
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
// ?dialog=add opens the add dialog, and ?dialog=restore (with ?page=settings) picks the 从备份恢复 backup.
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

if (targetDialog === "restore") {
  window.setTimeout(() => clickWhenReady(buttonByText("选择备份…")), 400);
}
