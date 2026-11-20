// Browser-only stand-in for @tauri-apps/api/core used by `npm run preview:ui`.
import { dashboardSummary, softwareSummary } from "./mock-data";

const params = new URLSearchParams(window.location.search);
const empty = params.has("empty");
const focused = new Set<string>(empty ? [] : ["code", "wps", "zotero", "matlab"]);
const hidden = new Set<string>(empty ? [] : ["onedrive", "everything"]);
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

export async function invoke<T>(command: string, args: Record<string, unknown> = {}): Promise<T> {
  await new Promise((resolve) => window.setTimeout(resolve, 60));
  const keys = (args.identityKeys as string[] | undefined) ?? [];
  const key = args.identityKey as string | undefined;

  switch (command) {
    case "get_dashboard_summary":
      return (empty ? { ...dashboardSummary(hidden), apps: [], most_used: null, recorded_today_seconds: 0, active_today_seconds: 0 } : dashboardSummary(hidden)) as T;
    case "get_software_page_summary":
      return (empty ? { focused: [], hidden: [], discovered: [] } : softwareSummary(focused, hidden)) as T;
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
    case "apply_window_close_choice":
      return undefined as T;
    default:
      throw new Error(`preview mock: unknown command ${command}`);
  }
}

// ?page=software|settings opens that page after the first render; ?dialog=add|close opens a dialog.
const pageLabels: Record<string, string> = { software: "软件", settings: "设置" };
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
