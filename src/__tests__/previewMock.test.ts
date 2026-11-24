import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { BackgroundPageSummary, CalendarSummary, DashboardSummary } from "../api";
import { invoke } from "../../scripts/ui-preview/tauri-core";

// The browser preview's answers to the v0.4.2 date-browsing commands, on a fixed virtual day.
describe("preview mock date browsing", () => {
  beforeAll(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 10, 22, 22, 1));
  });

  afterAll(() => {
    vi.useRealTimers();
  });

  it("bounds the calendar from 2026-09-03 to today, with no per-day data", async () => {
    const calendar = await invoke<CalendarSummary>("get_calendar_summary");

    expect(calendar).toEqual({ today: "2026-11-22", data_start_date: "2026-09-03" });
  });

  it("answers a past day with closed apps and stored background peaks", async () => {
    // The first day back from yesterday with over an hour of activity.
    let day: { date: string; active: number } | null = null;
    for (let date = 21; date > 0 && !day; date -= 1) {
      const candidate = `2026-11-${String(date).padStart(2, "0")}`;
      const summary = await invoke<DashboardSummary>("get_dashboard_summary", { date: candidate });
      if (summary.active_today_seconds > 3600) day = { date: candidate, active: summary.active_today_seconds };
    }
    expect(day).not.toBeNull();
    if (!day) return;

    const dashboard = await invoke<DashboardSummary>("get_dashboard_summary", { date: day.date });
    expect(dashboard).toMatchObject({
      usage_date: day.date,
      is_today: false,
      active_today_seconds: day.active,
    });
    expect(dashboard.recorded_today_seconds).toBeGreaterThanOrEqual(day.active);
    expect(dashboard.apps.length).toBeGreaterThan(0);
    expect(dashboard.apps.every((app) => app.status === "closed" && !app.is_running)).toBe(true);
    expect(dashboard.apps.every((app) => app.today_seconds > 0 || app.active_today_seconds > 0)).toBe(true);

    const background = await invoke<BackgroundPageSummary>("get_background_page_summary", { date: day.date });
    expect(background).toMatchObject({ usage_date: day.date, is_today: false, running_count: 0 });
    expect(background.rows.every((row) => !row.is_running && row.cpu_percent === null)).toBe(true);
  });

  it("keeps today live and rejects future or malformed dates", async () => {
    const today = await invoke<DashboardSummary>("get_dashboard_summary", { date: "2026-11-22" });
    expect(today).toMatchObject({ usage_date: "2026-11-22", is_today: true });
    await expect(invoke("get_background_page_summary")).resolves.toMatchObject({ is_today: true });

    await expect(invoke("get_dashboard_summary", { date: "2026-11-23" })).rejects.toBe("day_invalid_date");
    await expect(invoke("get_background_page_summary", { date: "2026-2-30" })).rejects.toBe("day_invalid_date");
  });

  it("is empty before the data start", async () => {
    const dashboard = await invoke<DashboardSummary>("get_dashboard_summary", { date: "2026-09-02" });
    expect(dashboard).toMatchObject({ apps: [], most_used: null, recorded_today_seconds: 0, is_today: false });
    const background = await invoke<BackgroundPageSummary>("get_background_page_summary", { date: "2026-09-02" });
    expect(background.rows).toEqual([]);
  });
});
