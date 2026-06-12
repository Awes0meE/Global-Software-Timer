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

import { getAppSettings, setDurationFormatPreference } from "../api";

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
});
