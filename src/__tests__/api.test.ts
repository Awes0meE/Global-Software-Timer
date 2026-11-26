import { afterEach, describe, expect, it, vi } from "vitest";

const mockInvoke = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/core", () => ({
  invoke: mockInvoke,
}));

vi.mock("@tauri-apps/plugin-autostart", () => ({
  disable: vi.fn(),
  enable: vi.fn(),
  isEnabled: vi.fn(),
}));

import {
  applySettingsImport,
  backupAllData,
  DAY_INVALID_DATE,
  exportSettingsFile,
  getAchievementsSummary,
  getAppSettings,
  getBackgroundPageSummary,
  getCalendarSummary,
  getDashboardSummary,
  getMilestoneSoftware,
  getStatisticsExport,
  pickSettingsImport,
  revealSavedFile,
  saveBinaryExport,
  saveTextExport,
  getStatisticsSummary,
  normalizeAccent,
  normalizeEink,
  normalizeReduceMotion,
  normalizeStartPage,
  normalizeTextSize,
  normalizeWeekStart,
  setDurationFormatPreference,
  setThemePreference,
  setUiPreference,
} from "../api";
import { ACCENT_IDS, EINK_IDS, START_PAGE_IDS } from "../appearancePresets";

describe("api statistics and achievements", () => {
  afterEach(() => {
    mockInvoke.mockReset();
  });

  it("reads the statistics summary for a date range", async () => {
    const summary = { start: "2026-11-15", end: "2026-11-21" };
    mockInvoke.mockResolvedValue(summary);

    await expect(
      getStatisticsSummary({ start: "2026-11-15", end: "2026-11-21", includeHidden: false }),
    ).resolves.toBe(summary);

    expect(mockInvoke).toHaveBeenCalledWith("get_statistics_summary", {
      start: "2026-11-15",
      end: "2026-11-21",
      includeHidden: false,
    });
  });

  it("reads the achievements summary for a heatmap length", async () => {
    const summary = { today: "2026-11-21", heatmap_days: 180 };
    mockInvoke.mockResolvedValue(summary);

    await expect(getAchievementsSummary({ heatmapDays: 180, includeHidden: true })).resolves.toBe(
      summary,
    );

    expect(mockInvoke).toHaveBeenCalledWith("get_achievements_summary", {
      heatmapDays: 180,
      includeHidden: true,
    });
  });

  it("reads the statistics export for a date range", async () => {
    const data = { start: "2026-11-15", end: "2026-11-21", software: [], days: [] };
    mockInvoke.mockResolvedValue(data);

    await expect(
      getStatisticsExport({ start: "2026-11-15", end: "2026-11-21", includeHidden: true }),
    ).resolves.toBe(data);

    expect(mockInvoke).toHaveBeenCalledWith("get_statistics_export", {
      start: "2026-11-15",
      end: "2026-11-21",
      includeHidden: true,
    });
  });

  it("reads the milestone software list", async () => {
    mockInvoke.mockResolvedValue([]);

    await expect(getMilestoneSoftware(false)).resolves.toEqual([]);

    expect(mockInvoke).toHaveBeenCalledWith("get_milestone_software", { includeHidden: false });
  });
});

describe("api date browsing", () => {
  afterEach(() => {
    mockInvoke.mockReset();
  });

  it("reads today's summaries without a date argument", async () => {
    mockInvoke.mockResolvedValue({});

    await getDashboardSummary();
    await getBackgroundPageSummary();

    expect(mockInvoke).toHaveBeenNthCalledWith(1, "get_dashboard_summary");
    expect(mockInvoke).toHaveBeenNthCalledWith(2, "get_background_page_summary");
  });

  it("passes a viewed past day to both summaries", async () => {
    const summary = { usage_date: "2026-11-17", is_today: false };
    mockInvoke.mockResolvedValue(summary);

    await expect(getDashboardSummary("2026-11-17")).resolves.toBe(summary);
    await expect(getBackgroundPageSummary("2026-11-17")).resolves.toBe(summary);

    expect(mockInvoke).toHaveBeenNthCalledWith(1, "get_dashboard_summary", { date: "2026-11-17" });
    expect(mockInvoke).toHaveBeenNthCalledWith(2, "get_background_page_summary", {
      date: "2026-11-17",
    });
  });

  it("passes the day_invalid_date error through", async () => {
    mockInvoke.mockRejectedValue("day_invalid_date");

    await expect(getDashboardSummary("2999-01-01")).rejects.toBe(DAY_INVALID_DATE);
    expect(DAY_INVALID_DATE).toBe("day_invalid_date");
  });

  it("reads the calendar summary", async () => {
    const summary = { today: "2026-11-24", data_start_date: "2026-09-03" };
    mockInvoke.mockResolvedValue(summary);

    await expect(getCalendarSummary()).resolves.toBe(summary);

    expect(mockInvoke).toHaveBeenCalledWith("get_calendar_summary");
  });
});

describe("api settings", () => {
  afterEach(() => {
    mockInvoke.mockReset();
  });

  it("normalizes the stored duration format from app settings", async () => {
    mockInvoke.mockResolvedValue({
      duration_format: "hours_minutes",
      duration_format_configured: true,
    });

    await expect(getAppSettings()).resolves.toMatchObject({
      duration_format: "hours_minutes",
      duration_format_configured: true,
    });
  });

  it("defaults unknown duration format values to decimal hours", async () => {
    mockInvoke.mockResolvedValue({
      duration_format: "unexpected",
      duration_format_configured: true,
    });

    await expect(getAppSettings()).resolves.toMatchObject({
      duration_format: "decimal_hours",
      duration_format_configured: false,
    });
  });

  it("saves the duration format preference through the Tauri command", async () => {
    mockInvoke.mockResolvedValue(undefined);

    await setDurationFormatPreference("hours_minutes");

    expect(mockInvoke).toHaveBeenCalledWith("set_duration_format_preference", {
      durationFormat: "hours_minutes",
    });
  });

  it("normalizes the stored theme and defaults unknown values to system", async () => {
    mockInvoke.mockResolvedValue({ theme: "dark", theme_configured: true });
    await expect(getAppSettings()).resolves.toMatchObject({ theme: "dark", theme_configured: true });

    mockInvoke.mockResolvedValue({ theme: "sepia", theme_configured: true });
    await expect(getAppSettings()).resolves.toMatchObject({
      theme: "system",
      theme_configured: false,
    });
  });

  it("saves the theme preference through the Tauri command", async () => {
    mockInvoke.mockResolvedValue(undefined);

    await setThemePreference("light");

    expect(mockInvoke).toHaveBeenCalledWith("set_theme_preference", { theme: "light" });
  });

  it("defaults the display preferences when the backend has none", async () => {
    mockInvoke.mockResolvedValue({});

    await expect(getAppSettings()).resolves.toMatchObject({
      accent: "blue",
      accent_configured: false,
      eink: "aurora",
      eink_configured: false,
      week_start: "monday",
      week_start_configured: false,
      start_page: "overview",
      start_page_configured: false,
      reduce_motion: "system",
      reduce_motion_configured: false,
      text_size: "standard",
      text_size_configured: false,
    });
  });

  it("keeps valid display preferences and their configured flags", async () => {
    mockInvoke.mockResolvedValue({
      accent: "system",
      accent_configured: true,
      eink: "forest",
      eink_configured: true,
      week_start: "sunday",
      week_start_configured: true,
      start_page: "achievements",
      start_page_configured: true,
      reduce_motion: "reduce",
      reduce_motion_configured: true,
      text_size: "large",
      text_size_configured: true,
    });

    await expect(getAppSettings()).resolves.toMatchObject({
      accent: "system",
      accent_configured: true,
      eink: "forest",
      eink_configured: true,
      week_start: "sunday",
      week_start_configured: true,
      start_page: "achievements",
      start_page_configured: true,
      reduce_motion: "reduce",
      reduce_motion_configured: true,
      text_size: "large",
      text_size_configured: true,
    });
  });

  it("treats unknown display preference values as unchosen defaults", async () => {
    mockInvoke.mockResolvedValue({
      accent: "red",
      accent_configured: true,
      eink: "sepia",
      eink_configured: true,
      week_start: "saturday",
      week_start_configured: true,
      start_page: "timeline",
      start_page_configured: true,
      reduce_motion: true,
      reduce_motion_configured: true,
      text_size: "huge",
      text_size_configured: true,
    });

    await expect(getAppSettings()).resolves.toMatchObject({
      accent: "blue",
      accent_configured: false,
      eink: "aurora",
      eink_configured: false,
      week_start: "monday",
      week_start_configured: false,
      start_page: "overview",
      start_page_configured: false,
      reduce_motion: "system",
      reduce_motion_configured: false,
      text_size: "standard",
      text_size_configured: false,
    });
  });

  it("normalises each display preference on its own", () => {
    expect(ACCENT_IDS.map(normalizeAccent)).toEqual(ACCENT_IDS);
    expect([undefined, null, "", "Blue", "#2f7de1", 3].map(normalizeAccent)).toEqual(Array(6).fill("blue"));
    expect(EINK_IDS.map(normalizeEink)).toEqual(EINK_IDS);
    expect([undefined, "Aurora", "blue"].map(normalizeEink)).toEqual(["aurora", "aurora", "aurora"]);
    expect(["monday", "sunday", "saturday", 0, undefined].map(normalizeWeekStart)).toEqual([
      "monday",
      "sunday",
      "monday",
      "monday",
      "monday",
    ]);
    expect(START_PAGE_IDS.map(normalizeStartPage)).toEqual(START_PAGE_IDS);
    expect(["settings", "timeline", "Overview", null].map(normalizeStartPage)).toEqual(Array(4).fill("overview"));
    expect(["system", "reduce", "true", true, undefined].map(normalizeReduceMotion)).toEqual([
      "system",
      "reduce",
      "system",
      "system",
      "system",
    ]);
    expect(["standard", "large", "Large", 1.25, undefined].map(normalizeTextSize)).toEqual([
      "standard",
      "large",
      "standard",
      "standard",
      "standard",
    ]);
  });

  it("saves a display preference through the one set_ui_preference command", async () => {
    mockInvoke.mockResolvedValue(undefined);

    await setUiPreference("accent", "violet");
    await setUiPreference("week_start", "sunday");
    await setUiPreference("reduce_motion", "reduce");
    await setUiPreference("text_size", "large");

    expect(mockInvoke).toHaveBeenNthCalledWith(1, "set_ui_preference", { key: "accent", value: "violet" });
    expect(mockInvoke).toHaveBeenNthCalledWith(2, "set_ui_preference", { key: "week_start", value: "sunday" });
    expect(mockInvoke).toHaveBeenNthCalledWith(3, "set_ui_preference", { key: "reduce_motion", value: "reduce" });
    expect(mockInvoke).toHaveBeenNthCalledWith(4, "set_ui_preference", { key: "text_size", value: "large" });
  });
});

describe("api exports", () => {
  afterEach(() => {
    mockInvoke.mockReset();
  });

  it("saves text exports with the camelCase argument names Tauri expects", async () => {
    const saved = "C:\\Users\\demo\\Downloads\\GST-日报-2026-11-24.csv";
    mockInvoke.mockResolvedValue(saved);

    await expect(
      saveTextExport({
        suggestedName: "GST-日报-2026-11-24.csv",
        filterName: "CSV",
        extension: "csv",
        contents: "日期\r\n",
      }),
    ).resolves.toBe(saved);

    expect(mockInvoke).toHaveBeenCalledWith("save_text_export", {
      suggestedName: "GST-日报-2026-11-24.csv",
      filterName: "CSV",
      extension: "csv",
      contents: "日期\r\n",
    });
  });

  it("saves PNG bytes as the raw body with the percent-encoded name header", async () => {
    const saved = "C:\\Users\\demo\\Downloads\\GST-成就-VS Code-2026-11-20.png";
    mockInvoke.mockResolvedValue(saved);
    const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

    await expect(saveBinaryExport(bytes, "GST-成就-VS Code-2026-11-20.png")).resolves.toBe(saved);

    expect(mockInvoke).toHaveBeenCalledWith("save_binary_export", bytes, {
      headers: { "x-gst-file-name": "GST-%E6%88%90%E5%B0%B1-VS%20Code-2026-11-20.png" },
    });
    expect(mockInvoke.mock.calls[0][1]).toBe(bytes);
  });

  it("passes cancelled dialogs through as null", async () => {
    mockInvoke.mockResolvedValue(null);

    await expect(exportSettingsFile()).resolves.toBeNull();
    await expect(backupAllData()).resolves.toBeNull();
    await expect(pickSettingsImport()).resolves.toBeNull();

    expect(mockInvoke).toHaveBeenNthCalledWith(1, "export_settings_file");
    expect(mockInvoke).toHaveBeenNthCalledWith(2, "backup_all_data");
    expect(mockInvoke).toHaveBeenNthCalledWith(3, "pick_settings_import");
  });

  it("reveals a saved file and applies an import by id", async () => {
    mockInvoke.mockResolvedValueOnce(undefined);
    await revealSavedFile("C:\\x.csv");
    expect(mockInvoke).toHaveBeenLastCalledWith("reveal_saved_file", { path: "C:\\x.csv" });

    const result = { focused_added: 2, hidden_added: 1, unmatched: 0, conflicts: 0 };
    mockInvoke.mockResolvedValueOnce(result);
    await expect(applySettingsImport("import-1")).resolves.toBe(result);
    expect(mockInvoke).toHaveBeenLastCalledWith("apply_settings_import", { importId: "import-1" });
  });
});
