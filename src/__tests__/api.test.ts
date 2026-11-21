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
  getAchievementsSummary,
  getAppSettings,
  getStatisticsSummary,
  setDurationFormatPreference,
  setThemePreference,
} from "../api";

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
});
