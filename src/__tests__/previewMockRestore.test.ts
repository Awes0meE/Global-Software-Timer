import { afterEach, describe, expect, it } from "vitest";
import type { RestorePreview } from "../api";
import { invoke } from "../../scripts/ui-preview/tauri-core";

function withQuery(query: string) {
  window.history.replaceState(null, "", `/${query}`);
}

// The browser preview's answers to the v0.4.4 restore and data-folder commands.
describe("preview mock restore", () => {
  afterEach(() => {
    withQuery("");
  });

  it("previews the approved demo backup and applies it once", async () => {
    withQuery("?restore=ok");
    const preview = await invoke<RestorePreview>("pick_restore_backup");

    expect(preview).toEqual({
      restore_id: "preview-restore",
      file_name: "GST-数据备份-2026-11-20.db",
      first_day: "2026-05-28",
      last_day: "2026-11-20",
      software_count: 142,
      file_size_bytes: 196 * 1024 * 1024,
    });
    await expect(invoke("apply_restore", { restoreId: "other" })).rejects.toBe("restore_failed");
    await expect(invoke("apply_restore", { restoreId: preview.restore_id })).resolves.toBeUndefined();
    await expect(invoke("apply_restore", { restoreId: preview.restore_id })).rejects.toBe("restore_failed");
  });

  it("forgets a discarded restore", async () => {
    const preview = await invoke<RestorePreview>("pick_restore_backup");
    await invoke("discard_restore", { restoreId: preview.restore_id });
    await expect(invoke("apply_restore", { restoreId: preview.restore_id })).rejects.toBe("restore_failed");
  });

  it("rejects the pick with each error mode, and fails the apply with ?restore=fail", async () => {
    const modes = {
      invalid: "restore_invalid",
      newer: "restore_newer",
      live: "restore_live_database",
      space: "restore_no_space",
    };
    for (const [mode, code] of Object.entries(modes)) {
      withQuery(`?restore=${mode}`);
      await expect(invoke("pick_restore_backup")).rejects.toBe(code);
    }
    withQuery("?restore=fail");
    const preview = await invoke<RestorePreview>("pick_restore_backup");
    await expect(invoke("apply_restore", { restoreId: preview.restore_id })).rejects.toBe("restore_failed");
  });

  it("cancels the pick with ?export=cancel", async () => {
    withQuery("?export=cancel");
    await expect(invoke("pick_restore_backup")).resolves.toBeNull();
  });

  it("reports the restore status once", async () => {
    await expect(invoke("get_restore_status")).resolves.toBe("none");
    withQuery("?restorestatus=rolled_back");
    await expect(invoke("get_restore_status")).resolves.toBe("rolled_back");
    await expect(invoke("get_restore_status")).resolves.toBe("none");
  });

  it("opens the data folder, or fails with ?export=fail", async () => {
    await expect(invoke("open_data_folder")).resolves.toBeUndefined();
    withQuery("?export=fail");
    await expect(invoke("open_data_folder")).rejects.toBe("data_folder_open_failed");
  });
});
