import { afterEach, describe, expect, it, vi } from "vitest";

const mockInvoke = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/core", () => ({
  invoke: mockInvoke,
}));

import {
  applyRestore,
  discardRestore,
  getRestoreStatus,
  openDataFolder,
  pickRestoreBackup,
  RESTORE_ERRORS,
  restoreErrorMessage,
  type RestorePreview,
} from "../api";

describe("api restore and data folder", () => {
  afterEach(() => {
    mockInvoke.mockReset();
  });

  it("picks a backup and passes the preview or a cancelled dialog through", async () => {
    const preview: RestorePreview = {
      restore_id: "restore-1",
      file_name: "GST-数据备份-2026-11-20.db",
      first_day: "2026-05-28",
      last_day: "2026-11-20",
      software_count: 142,
      file_size_bytes: 196 * 1024 * 1024,
    };
    mockInvoke.mockResolvedValueOnce(preview);
    await expect(pickRestoreBackup()).resolves.toBe(preview);
    mockInvoke.mockResolvedValueOnce(null);
    await expect(pickRestoreBackup()).resolves.toBeNull();

    expect(mockInvoke).toHaveBeenNthCalledWith(1, "pick_restore_backup");
    expect(mockInvoke).toHaveBeenNthCalledWith(2, "pick_restore_backup");
  });

  it("applies or discards a staged restore by id", async () => {
    mockInvoke.mockResolvedValue(undefined);

    await applyRestore("restore-1");
    expect(mockInvoke).toHaveBeenLastCalledWith("apply_restore", { restoreId: "restore-1" });
    await discardRestore("restore-1");
    expect(mockInvoke).toHaveBeenLastCalledWith("discard_restore", { restoreId: "restore-1" });
  });

  it("reads the one-shot restore status and treats anything unknown as none", async () => {
    for (const status of ["restored", "rolled_back", "none"] as const) {
      mockInvoke.mockResolvedValueOnce(status);
      await expect(getRestoreStatus()).resolves.toBe(status);
    }
    mockInvoke.mockResolvedValueOnce("later_value");
    await expect(getRestoreStatus()).resolves.toBe("none");
    expect(mockInvoke).toHaveBeenLastCalledWith("get_restore_status");
  });

  it("opens the data folder without passing a path", async () => {
    mockInvoke.mockResolvedValue(undefined);

    await openDataFolder();

    expect(mockInvoke).toHaveBeenCalledWith("open_data_folder");
  });

  it("maps every restore error code to its message", () => {
    expect(RESTORE_ERRORS).toEqual({
      invalid: "restore_invalid",
      newer: "restore_newer",
      liveDatabase: "restore_live_database",
      noSpace: "restore_no_space",
      failed: "restore_failed",
    });
    expect(restoreErrorMessage("restore_invalid")).toBe("这个文件不是有效的 GST 备份。");
    expect(restoreErrorMessage("restore_newer")).toBe("这份备份来自更新版本的 GST，无法在当前版本恢复。");
    expect(restoreErrorMessage("restore_live_database")).toBe("不能选择正在使用的数据库。");
    expect(restoreErrorMessage("restore_no_space")).toBe("磁盘空间不足，无法恢复。");
    expect(restoreErrorMessage("restore_failed")).toBe("恢复失败，当前数据没有改动。");
    expect(restoreErrorMessage(new Error("ipc down"))).toBe("恢复失败，当前数据没有改动。");
    expect(restoreErrorMessage("toString")).toBe("恢复失败，当前数据没有改动。");
  });
});
