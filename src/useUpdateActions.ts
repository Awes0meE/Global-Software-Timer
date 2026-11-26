import { useCallback, useRef, useState } from "react";
import { cancelUpdate, checkForUpdate, installUpdate } from "./api";
import { downloadFinished, type UpdateDialogState } from "./components/UpdateDialog";
import type { ToastMessage } from "./components/Toast";

type ShowToast = (message: string, extra?: Omit<ToastMessage, "id" | "message">) => void;

/**
 * 设置 → 关于与反馈 → 检查更新… (v0.4.6). GST goes online only here: 检查更新… opens the consent dialog, and
 * only its 联网检查 key calls `check_for_update`, every time; nothing is asked at startup or remembered.
 * A newer release opens 发现新版本, whose 更新并重启 backs up, downloads and installs; the app then exits
 * and the installer starts the new version.
 */
export function useUpdateActions(showToast: ShowToast) {
  const [dialog, setDialog] = useState<UpdateDialogState | null>(null);
  const [checking, setChecking] = useState(false);
  // Every open and close starts a new run; a check or an update of an earlier run is ignored.
  const runRef = useRef(0);
  const checkingRunRef = useRef<number | null>(null);

  const open = useCallback(() => {
    runRef.current += 1;
    checkingRunRef.current = null;
    setChecking(false);
    setDialog({ kind: "consent" });
  }, []);

  const check = useCallback(async () => {
    const run = runRef.current;
    if (checkingRunRef.current === run) return;
    checkingRunRef.current = run;
    setChecking(true);
    try {
      const info = await checkForUpdate();
      if (run !== runRef.current) return;
      if (info) {
        setDialog({ kind: "found", info });
      } else {
        setDialog(null);
        showToast("已是最新版本");
      }
    } catch {
      if (run !== runRef.current) return;
      setDialog(null);
      showToast("无法连接到 GitHub", { tone: "error" });
    } finally {
      if (run === runRef.current) {
        checkingRunRef.current = null;
        setChecking(false);
      }
    }
  }, [showToast]);

  const close = useCallback(() => {
    if (dialog?.kind === "installing") {
      // Once downloaded, the installer is being started and cannot be stopped.
      if (downloadFinished(dialog.progress)) return;
      void cancelUpdate().catch(() => {});
    }
    runRef.current += 1;
    checkingRunRef.current = null;
    setChecking(false);
    setDialog(null);
  }, [dialog]);

  const install = useCallback(async () => {
    if (dialog?.kind !== "found") return;
    const { info } = dialog;
    runRef.current += 1;
    const run = runRef.current;
    setDialog({ kind: "installing", info, progress: null });
    try {
      // On success the app exits and the installer restarts it; the dialog stays until then.
      await installUpdate((progress) => {
        if (run !== runRef.current) return;
        setDialog((current) => (current?.kind === "installing" ? { ...current, progress } : current));
      });
    } catch {
      // A cancelled update has already closed its dialog.
      if (run !== runRef.current) return;
      setDialog(null);
      showToast("更新没有完成", { tone: "error" });
    }
  }, [dialog, showToast]);

  return { dialog, checking, open, check, close, install };
}
