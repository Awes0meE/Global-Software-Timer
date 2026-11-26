import { useEffect, useRef } from "react";
import type { RestorePreview } from "../api";
import { useModalDialog } from "./useModalDialog";
import "./SettingsImportDialog.css";
import "./RestoreDialog.css";

/** The 从备份恢复 dialog: a picked backup to confirm, or why the restore cannot go ahead. */
export type RestoreDialogState = { kind: "confirm"; preview: RestorePreview } | { kind: "error"; message: string };

const KB = 1024;
const MB = 1024 * KB;

/** Spec v0.4.4 §H: whole MB from 10 MB, one decimal below that, KB below 1 MB. */
export function formatFileSize(bytes: number): string {
  const mb = bytes / MB;
  if (Math.round(mb * 10) / 10 >= 10) return `${Math.round(mb)} MB`;
  if (Math.round(bytes / KB) >= 1024) return `${mb.toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / KB))} KB`;
}

function recordRange(preview: RestorePreview): string {
  return preview.first_day && preview.last_day ? `${preview.first_day} 至 ${preview.last_day}` : "—";
}

interface RestoreDialogProps {
  state: RestoreDialogState;
  /** 恢复并重启 is under way: both keys are off and Esc does nothing. */
  busy: boolean;
  onConfirm: () => void;
  /** 取消, 关闭 or Esc. */
  onClose: () => void;
}

/** In the 导入设置 dialog's language (useModalDialog): focus starts on 取消 or 关闭 and returns to 选择备份…. */
export function RestoreDialog({ state, busy, onConfirm, onClose }: RestoreDialogProps) {
  const dialogRef = useRef<HTMLElement>(null);
  const firstKeyRef = useRef<HTMLButtonElement>(null);

  // While 恢复并重启 runs both keys are off; hold focus on the dialog so Esc and the Tab trap still apply.
  useEffect(() => {
    if (busy) dialogRef.current?.focus();
  }, [busy]);

  useModalDialog(dialogRef, { onCancel: onClose, busy, initialFocus: firstKeyRef });

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        // A press on the scrim keeps focus where it is, inside the dialog.
        if (event.target === event.currentTarget) event.preventDefault();
      }}
    >
      <section
        ref={dialogRef}
        className="dialog import-dialog restore-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="restore-dialog-title"
        aria-describedby={state.kind === "error" ? "restore-dialog-message" : "restore-dialog-copy"}
        aria-busy={busy || undefined}
        tabIndex={-1}
      >
        <h2 id="restore-dialog-title">从备份恢复</h2>
        {state.kind === "confirm" ? (
          <>
            <dl className="import-facts">
              {[
                ["备份文件", state.preview.file_name],
                ["记录范围", recordRange(state.preview)],
                ["软件", `${state.preview.software_count} 个`],
                ["文件大小", formatFileSize(state.preview.file_size_bytes)],
              ].map(([label, value]) => (
                <div className="import-fact" key={label}>
                  <dt>{label}</dt>
                  <dd className="num">{value}</dd>
                </div>
              ))}
            </dl>
            <div className="restore-copy" id="restore-dialog-copy">
              <p>当前数据会被这份备份替换，备份日期之后的记录将不再保留。</p>
              <p>替换前，当前数据会自动另存到数据文件夹的 backups 里。</p>
            </div>
            <div className="dialog-actions">
              <button ref={firstKeyRef} type="button" className="button button-secondary" disabled={busy} onClick={onClose}>
                取消
              </button>
              <button type="button" className="button button-primary" disabled={busy} onClick={onConfirm}>
                恢复并重启
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="restore-copy">
              <p id="restore-dialog-message">{state.message}</p>
            </div>
            <div className="dialog-actions">
              <button ref={firstKeyRef} type="button" className="button button-primary" onClick={onClose}>
                关闭
              </button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
