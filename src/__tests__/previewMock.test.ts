import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type {
  BackgroundPageSummary,
  CalendarSummary,
  DashboardSummary,
  MilestoneSoftware,
  StatisticsExport,
  StatisticsSummary,
} from "../api";
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

// The v0.4.3 export commands, on the same fixed virtual day.
describe("preview mock exports", () => {
  beforeAll(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 10, 22, 22, 1));
  });

  afterAll(() => {
    vi.useRealTimers();
  });

  it("lists the milestone software by tier with their reached dates", async () => {
    const software = await invoke<MilestoneSoftware[]>("get_milestone_software", { includeHidden: false });

    expect(software.map((row) => [row.identity_key, row.tier_hours, row.reached_on])).toEqual([
      ["code", 6666, "2026-11-20"],
      ["chrome", 500, "2026-10-12"],
      ["excel", 100, "2026-11-22"],
      ["typora", 50, "2026-11-02"],
      ["matlab", 50, "2026-09-20"],
      ["terminal", 10, "2026-11-16"],
    ]);
    expect(software.every((row) => row.used_days > 0 && row.process_name !== "")).toBe(true);
    // Day counts match the approved 成就海报 mocks.
    expect(software.find((row) => row.identity_key === "code")?.used_days).toBe(1046);

    const all = await invoke<MilestoneSoftware[]>("get_milestone_software", { includeHidden: true });
    expect(all.map((row) => row.identity_key)).toContain("snipaste");
  });

  it("answers the statistics export consistently with the summary", async () => {
    const range = { start: "2026-11-16", end: "2026-11-22", includeHidden: false };
    const data = await invoke<StatisticsExport>("get_statistics_export", range);
    const summary = await invoke<StatisticsSummary>("get_statistics_summary", range);

    const ledger = data.software.filter((row) => row.focused_seconds > 0 || row.window_seconds > 0);
    expect(ledger.map((row) => [row.identity_key, row.focused_seconds, row.window_seconds])).toEqual(
      summary.ranking.map((row) => [row.identity_key, row.focused_seconds, row.window_seconds]),
    );
    expect(data.software.some((row) => row.identity_key === "snipaste" || row.identity_key === "onedrive")).toBe(false);
    expect(data.software.some((row) => row.background_seconds > 0)).toBe(true);
    // Steam has had no window for 45 days but keeps running in the background.
    expect(data.software.find((row) => row.identity_key === "steam")).toMatchObject({
      focused_seconds: 0,
      window_seconds: 0,
      used_days: 0,
    });
    expect(data.software.find((row) => row.identity_key === "steam")?.background_seconds).toBeGreaterThan(0);
    const withHidden = await invoke<StatisticsExport>("get_statistics_export", { ...range, includeHidden: true });
    expect(withHidden.software.some((row) => row.identity_key === "onedrive")).toBe(true);
    for (const software of data.software) {
      const rows = data.days.filter((row) => row.identity_key === software.identity_key);
      expect(rows.reduce((sum, row) => sum + row.focused_seconds, 0)).toBe(software.focused_seconds);
      expect(software.used_days).toBe(rows.filter((row) => row.focused_seconds >= 300).length);
    }
    const order = data.days.map((row) => `${row.date}|${String(1e9 - row.focused_seconds).padStart(10, "0")}`);
    expect(order).toEqual([...order].sort());

    await expect(
      invoke("get_statistics_export", { start: "2026-11-22", end: "2026-11-16", includeHidden: false }),
    ).rejects.toThrow("statistics_invalid_range");
  });
});
