import { afterEach, describe, expect, it, vi } from "vitest";
import type { AppSettings, SettingsImportPreview } from "../api";

// The preview mock reads its query string once, at import: load a fresh copy per URL.
async function mockAt(search: string) {
  window.history.replaceState(null, "", `/${search}`);
  vi.resetModules();
  return (await import("../../scripts/ui-preview/tauri-core")).invoke;
}

describe("preview mock display preferences", () => {
  afterEach(() => {
    window.history.replaceState(null, "", "/");
  });

  it("starts from the unchosen defaults", async () => {
    const invoke = await mockAt("");

    await expect(invoke<AppSettings>("get_app_settings")).resolves.toMatchObject({
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
    });
  });

  it("takes each preference from the query", async () => {
    const invoke = await mockAt("?accent=rose&eink=night&weekstart=sun&startpage=statistics&motion=reduce");

    await expect(invoke<AppSettings>("get_app_settings")).resolves.toMatchObject({
      accent: "rose",
      accent_configured: true,
      eink: "night",
      eink_configured: true,
      week_start: "sunday",
      week_start_configured: true,
      start_page: "statistics",
      start_page_configured: true,
      reduce_motion: "reduce",
      reduce_motion_configured: true,
    });
  });

  it("saves through set_ui_preference and rejects what the backend rejects", async () => {
    const invoke = await mockAt("");

    await invoke("set_ui_preference", { key: "accent", value: "system" });
    await invoke("set_ui_preference", { key: "week_start", value: "sunday" });
    await expect(invoke<AppSettings>("get_app_settings")).resolves.toMatchObject({
      accent: "system",
      accent_configured: true,
      week_start: "sunday",
      week_start_configured: true,
    });

    await expect(invoke("set_ui_preference", { key: "glass", value: "clear" })).rejects.toBe(
      "ui_preference_unknown_key",
    );
    await expect(invoke("set_ui_preference", { key: "start_page", value: "settings" })).rejects.toBe(
      "ui_preference_invalid_value",
    );
    await expect(invoke<AppSettings>("get_app_settings")).resolves.toMatchObject({ start_page: "overview" });
  });

  // The demo settings file changes the display preferences too, so the import dialog's 760 px layout shows.
  it("previews and applies the demo file's display preferences, skipping values already set", async () => {
    const invoke = await mockAt("?eink=warm");

    const preview = await invoke<SettingsImportPreview>("pick_settings_import");
    expect(preview.changes).toEqual([
      { key: "theme", from: "system", to: "dark" },
      { key: "accent", from: "blue", to: "violet" },
      { key: "week_start", from: "monday", to: "sunday" },
      { key: "start_page", from: "overview", to: "statistics" },
      { key: "reduce_motion", from: "system", to: "reduce" },
    ]);

    await invoke("apply_settings_import", { importId: preview.import_id });
    await expect(invoke<AppSettings>("get_app_settings")).resolves.toMatchObject({
      theme: "dark",
      accent: "violet",
      accent_configured: true,
      eink: "warm",
      week_start: "sunday",
      week_start_configured: true,
      start_page: "statistics",
      start_page_configured: true,
      reduce_motion: "reduce",
      reduce_motion_configured: true,
    });
  });
});
