import { invoke } from "@tauri-apps/api/core";

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
}

export async function getDashboardSummary(): Promise<DashboardSummary> {
  return invoke<DashboardSummary>("get_dashboard_summary");
}
