import { invoke } from "@tauri-apps/api/core";
import { disable, enable, isEnabled } from "@tauri-apps/plugin-autostart";

export interface AppUsageRow {
  app_id: number;
  display_name: string;
  process_name: string;
  total_seconds: number;
  today_seconds: number;
  is_running: boolean;
}

export interface DashboardSummary {
  product_title: string;
  locale: string;
  most_used: AppUsageRow | null;
  recorded_today_seconds: number;
  active_today_seconds: number;
  apps: AppUsageRow[];
  hidden_apps: AppUsageRow[];
}

export async function getDashboardSummary(): Promise<DashboardSummary> {
  return invoke<DashboardSummary>("get_dashboard_summary");
}

export async function hideAppGroup(appId: number): Promise<void> {
  return invoke("hide_app_group", { appId });
}

export async function unhideAppGroup(appId: number): Promise<void> {
  return invoke("unhide_app_group", { appId });
}

export async function renameAppGroup(appId: number, displayName: string): Promise<void> {
  return invoke("rename_app_group", { appId, displayName });
}

export async function getAutostartEnabled(): Promise<boolean> {
  return isEnabled();
}

export async function setAutostartEnabled(enabled: boolean): Promise<void> {
  if (enabled) {
    await enable();
  } else {
    await disable();
  }
}
