import { useCallback, useRef, useState } from "react";
import {
  EXPORT_ERRORS,
  applySettingsImport,
  backupAllData,
  exportSettingsFile,
  pickSettingsImport,
  revealSavedFile,
  saveTextExport,
  type SettingsImportPreview,
} from "./api";
import type { ToastMessage } from "./components/Toast";
import { buildCsvExport, isCsvExportAction, type CsvExportContext } from "./exports";
import type { ExportActionId } from "./pageExports";

interface ExportActionsOptions {
  /** Read when an export starts, so it covers the day or range on screen at that moment. */
  csvContext: CsvExportContext;
  /** Awaited before a settings import is applied, so a settings save still under way cannot overwrite it. */
  beforeSettingsImport?: () => Promise<void>;
  /** Runs after a settings import is applied: reload settings, theme and the lists. */
  onSettingsImported: () => void | Promise<void>;
}

/**
 * The header export keys' actions (spec v0.4.2, decisions C, D, F and G). Each save runs the native dialog
 * in Rust; a saved file gets the 已保存 toast with 在文件夹中显示, a cancelled dialog changes nothing and a
 * failure shows 保存失败. 导入设置… opens a preview that `confirmImport` applies.
 */
export function useExportActions({ csvContext, beforeSettingsImport, onSettingsImported }: ExportActionsOptions) {
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [importPreview, setImportPreview] = useState<SettingsImportPreview | null>(null);
  const [importBusy, setImportBusy] = useState(false);
  const busyRef = useRef(false);
  const toastIdRef = useRef(0);
  const contextRef = useRef(csvContext);
  contextRef.current = csvContext;
  const importedRef = useRef(onSettingsImported);
  importedRef.current = onSettingsImported;
  const beforeImportRef = useRef(beforeSettingsImport);
  beforeImportRef.current = beforeSettingsImport;

  const showToast = useCallback((message: string, extra: Omit<ToastMessage, "id" | "message"> = {}) => {
    toastIdRef.current += 1;
    setToast({ id: toastIdRef.current, message, ...extra });
  }, []);

  const handleExport = useCallback(
    (action: ExportActionId) => {
      // One dialog at a time: a second press while a save is open does nothing.
      if (busyRef.current) return;
      busyRef.current = true;
      setBusy(true);

      void (async () => {
        try {
          if (action === "settings-import") {
            const preview = await pickSettingsImport();
            if (preview) setImportPreview(preview);
            return;
          }

          const path =
            action === "settings-export"
              ? await exportSettingsFile()
              : action === "data-backup"
                ? await backupAllData()
                : isCsvExportAction(action)
                  ? await saveTextExport(await buildCsvExport(action, contextRef.current))
                  : null;
          if (path === null) return;

          showToast("已保存", {
            action: {
              label: "在文件夹中显示",
              onClick: () => {
                // The file may have been moved or deleted since.
                void revealSavedFile(path).catch(() => showToast("无法打开文件夹", { tone: "error" }));
              },
            },
          });
        } catch (error) {
          showToast(action === "settings-import" ? importPickError(error) : "保存失败", { tone: "error" });
        } finally {
          busyRef.current = false;
          setBusy(false);
        }
      })();
    },
    [showToast],
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

  return { busy, toast, dismissToast, handleExport, importPreview, importBusy, confirmImport, cancelImport };
}

function importPickError(error: unknown): string {
  if (error === EXPORT_ERRORS.importTooLarge) return "设置文件过大";
  if (error === EXPORT_ERRORS.importInvalid) return "不是有效的设置文件";
  return "读取失败";
}
