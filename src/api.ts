import { invoke } from "@tauri-apps/api/core";

export type CloseBehavior = "exit" | "minimize_to_tray";
export type AppRuntimeStatus = "foreground" | "background" | "closed";

export interface AppUsageRow {
  app_id: number;
  display_name: string;
  process_name: string;
  icon_data_url: string | null;
  total_seconds: number;
  today_seconds: number;
  active_today_seconds: number;
  status: AppRuntimeStatus;
  is_running: boolean;
}

export interface DashboardSummary {
  product_title: string;
  locale: string;
  most_used: AppUsageRow | null;
  recorded_today_seconds: number;
  active_today_seconds: number;
  apps: AppUsageRow[];
}

export async function getDashboardSummary(): Promise<DashboardSummary> {
  return invoke<DashboardSummary>("get_dashboard_summary");
}

export async function getCloseBehaviorPreference(): Promise<CloseBehavior | null> {
  const preference = await invoke<CloseBehavior | null>("get_close_behavior_preference");

  return preference === "exit" || preference === "minimize_to_tray" ? preference : null;
}

export async function applyWindowCloseChoice(
  choice: CloseBehavior,
  remember: boolean,
): Promise<void> {
  return invoke("apply_window_close_choice", { choice, remember });
}
