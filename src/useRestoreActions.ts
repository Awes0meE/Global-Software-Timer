import { useCallback, useEffect, useRef, useState } from "react";
import {
  applyRestore,
  discardRestore,
  getRestoreStatus,
  openDataFolder,
  pickRestoreBackup,
  restoreErrorMessage,
} from "./api";
import type { RestoreDialogState } from "./components/RestoreDialog";
import type { ToastMessage } from "./components/Toast";

type ShowToast = (message: string, extra?: Omit<ToastMessage, "id" | "message">) => void;

/**
 * The 设置 数据 keys (spec v0.4.4 §G, §H): 打开 the data folder, and 选择备份… → the 从备份恢复 confirm or
 * error dialog → 恢复并重启, which exits and restarts the app. A start right after a restore says how it
 * went, once.
 */
export function useRestoreActions(showToast: ShowToast) {
  const [dialog, setDialog] = useState<RestoreDialogState | null>(null);
  const [applying, setApplying] = useState(false);
  const pickingRef = useRef(false);
  const statusAskedRef = useRef(false);

  // The status is reported once per start, so it is asked once (a StrictMode re-run keeps the ref).
  useEffect(() => {
    if (statusAskedRef.current) return;
    statusAskedRef.current = true;
    getRestoreStatus()
      .then((status) => {
        if (status === "restored") showToast("已从备份恢复");
        else if (status === "rolled_back") showToast("恢复没有完成，已保留原来的数据", { tone: "error" });
      })
      .catch(() => {});
  }, [showToast]);

  const openFolder = useCallback(() => {
    void openDataFolder().catch(() => showToast("无法打开数据文件夹", { tone: "error" }));
  }, [showToast]);

  // The native file dialog is modal; a second press while the backup is still being checked does nothing.
  const pick = useCallback(async () => {
    if (pickingRef.current) return;
    pickingRef.current = true;
    try {
      const preview = await pickRestoreBackup();
      if (preview) setDialog({ kind: "confirm", preview });
    } catch (error) {
      setDialog({ kind: "error", message: restoreErrorMessage(error) });
    } finally {
      pickingRef.current = false;
    }
  }, []);

  const close = useCallback(() => {
    if (applying) return;
    // The staged copy is single use: cancelling deletes it.
    if (dialog?.kind === "confirm") void discardRestore(dialog.preview.restore_id).catch(() => {});
    setDialog(null);
  }, [applying, dialog]);

  const confirm = useCallback(async () => {
    if (dialog?.kind !== "confirm" || applying) return;
    setApplying(true);
    try {
      // On success the app exits and restarts itself; the dialog stays busy until then.
      await applyRestore(dialog.preview.restore_id);
    } catch (error) {
      setApplying(false);
      setDialog({ kind: "error", message: restoreErrorMessage(error) });
    }
  }, [applying, dialog]);

  return { dialog, applying, openFolder, pick, close, confirm };
}
