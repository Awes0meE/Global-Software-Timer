import { useCallback, useRef, useState } from "react";
import {
  EXPORT_ERRORS,
  applySettingsImport,
  backupAllData,
  exportSettingsFile,
  pickSettingsImport,
  revealSavedFile,
  saveTextExport,
  type MilestoneSoftware,
  type SettingsImportPreview,
} from "./api";
import type { ToastMessage } from "./components/Toast";
import { buildCsvExport, isCsvExportAction, type CsvExportContext } from "./exports";
import type { ExportActionId } from "./pageExports";

/** How a save ended: saved (toast shown), cancelled in the dialog, failed (toast shown), or not started. */
export type SaveOutcome = "saved" | "cancelled" | "failed" | "busy";

interface ExportActionsOptions {
  /** Read when an export starts, so it covers the day or range on screen at that moment. */
  context: CsvExportContext;
  /** Awaited before a settings import is applied, so a settings save still under way cannot overwrite it. */
  beforeSettingsImport?: () => Promise<void>;
  /** Runs after a settings import is applied: reload settings, theme and the lists. */
  onSettingsImported: () => void | Promise<void>;
}

const loadPosterExports = () => import("./posterExports");

/**
 * The header export keys' actions (spec v0.4.2, decisions C, D, F and G; v0.4.3 C to E). Each save runs the
 * native dialog in Rust; a saved file gets the 已保存 toast with 在文件夹中显示, a cancelled dialog changes
 * nothing and a failure shows 保存失败. 导入设置… opens a preview that `confirmImport` applies. The 成就海报
 * dialog saves through `saveAchievementPoster`, which tells it how the save ended.
 */
export function useExportActions({ context, beforeSettingsImport, onSettingsImported }: ExportActionsOptions) {
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [importPreview, setImportPreview] = useState<SettingsImportPreview | null>(null);
  const [importBusy, setImportBusy] = useState(false);
  const busyRef = useRef(false);
  const toastIdRef = useRef(0);
  const contextRef = useRef(context);
  contextRef.current = context;
  const importedRef = useRef(onSettingsImported);
  importedRef.current = onSettingsImported;
  const beforeImportRef = useRef(beforeSettingsImport);
  beforeImportRef.current = beforeSettingsImport;

  const showToast = useCallback((message: string, extra: Omit<ToastMessage, "id" | "message"> = {}) => {
    toastIdRef.current += 1;
    setToast({ id: toastIdRef.current, message, ...extra });
  }, []);

  // One save at a time: a second press while a save (or its dialog) is under way does nothing.
  const runSave = useCallback(
    async (save: () => Promise<string | null>): Promise<SaveOutcome> => {
      if (busyRef.current) return "busy";
      busyRef.current = true;
      setBusy(true);
      try {
        const path = await save();
        if (path === null) return "cancelled";
        showToast("已保存", {
          action: {
            label: "在文件夹中显示",
            onClick: () => {
              // The file may have been moved or deleted since.
              void revealSavedFile(path).catch(() => showToast("无法打开文件夹", { tone: "error" }));
            },
          },
        });
        return "saved";
      } catch {
        showToast("保存失败", { tone: "error" });
        return "failed";
      } finally {
        busyRef.current = false;
        setBusy(false);
      }
    },
    [showToast],
  );

  const pickImport = useCallback(async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      const preview = await pickSettingsImport();
      if (preview) setImportPreview(preview);
    } catch (error) {
      showToast(importPickError(error), { tone: "error" });
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, [showToast]);

  const handleExport = useCallback(
    (action: ExportActionId) => {
      if (action === "settings-import") {
        void pickImport();
        return;
      }
      // 导出成就 opens the 成就海报 dialog (App), which saves through saveAchievementPoster.
      if (action === "achievements-poster") return;
      const save = (): Promise<string | null> => {
        const current = contextRef.current;
        if (action === "settings-export") return exportSettingsFile();
        if (action === "data-backup") return backupAllData();
        if (isCsvExportAction(action)) return buildCsvExport(action, current).then(saveTextExport);
        return loadPosterExports().then(({ saveDailyPoster }) => saveDailyPoster(current.viewedDate, current.today));
      };
      void runSave(save);
    },
    [pickImport, runSave],
  );

  const saveAchievementPoster = useCallback(
    (software: MilestoneSoftware) =>
      runSave(() => loadPosterExports().then((posters) => posters.saveAchievementPoster(software))),
    [runSave],
  );

  const confirmImport = useCallback(async () => {
    if (!importPreview || importBusy) return;
    setImportBusy(true);
    let applied = false;
    try {
      await beforeImportRef.current?.();
      await applySettingsImport(importPreview.import_id);
      applied = true;
    } catch {
      // The id is single use and may have expired; picking the file again starts over.
      showToast("导入失败", { tone: "error" });
    } finally {
      setImportPreview(null);
      setImportBusy(false);
    }
    if (!applied) return;
    showToast("已导入");
    try {
      await importedRef.current();
    } catch {
      // The reload reports its own failures.
    }
  }, [importPreview, importBusy, showToast]);

  const cancelImport = useCallback(() => {
    if (!importBusy) setImportPreview(null);
  }, [importBusy]);

  const dismissToast = useCallback(() => setToast(null), []);

  return {
    busy,
    toast,
    dismissToast,
    showToast,
    handleExport,
    saveAchievementPoster,
    importPreview,
    importBusy,
    confirmImport,
    cancelImport,
  };
}

function importPickError(error: unknown): string {
  if (error === EXPORT_ERRORS.importTooLarge) return "设置文件过大";
  if (error === EXPORT_ERRORS.importInvalid) return "不是有效的设置文件";
  return "读取失败";
}
