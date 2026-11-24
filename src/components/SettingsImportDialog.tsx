import { useEffect, useRef, type KeyboardEvent } from "react";
import type { SettingChange, SettingsImportPreview } from "../api";
import "./SettingsImportDialog.css";

export interface ImportFact {
  label: string;
  /** A count such as "+2", or for a setting the value it has now. */
  value: string;
  /** For a setting: the value the import sets. */
  to?: string;
}

const SETTING_LABELS: Record<string, string> = {
  theme: "主题",
  duration_format: "显示分钟数",
  close_behavior: "关闭窗口",
};

const VALUE_LABELS: Record<string, Record<string, string>> = {
  theme: { system: "跟随系统", light: "浅色", dark: "深色" },
  duration_format: { decimal_hours: "已关闭", hours_minutes: "已开启" },
  close_behavior: { minimize_to_tray: "最小化到后台", exit: "直接退出" },
};

function settingValue(change: SettingChange, value: string): string {
  return VALUE_LABELS[change.key]?.[value] ?? value;
}

/** The preview as rows: each changed setting, then what the lists gain and what is skipped. */
export function importFacts(preview: SettingsImportPreview): ImportFact[] {
  return [
    ...preview.changes.map((change) => ({
      label: SETTING_LABELS[change.key] ?? change.key,
      value: settingValue(change, change.from),
      to: settingValue(change, change.to),
    })),
    { label: "特别关注", value: `+${preview.focused_added}` },
    { label: "隐藏软件", value: `+${preview.hidden_added}` },
    { label: "未匹配", value: String(preview.unmatched) },
    { label: "冲突", value: String(preview.conflicts) },
  ];
}

interface SettingsImportDialogProps {
  preview: SettingsImportPreview;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** The glass confirm dialog for 导入设置…: the preview's facts as rows, with 取消 and 导入. */
export function SettingsImportDialog({ preview, busy, onConfirm, onCancel }: SettingsImportDialogProps) {
  const dialogRef = useRef<HTMLElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const facts = importFacts(preview);

  // Focus starts on 取消 and goes back to where it was (the 迁移与备份 key) when the dialog closes.
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    cancelRef.current?.focus();
    return () => {
      if (opener && document.contains(opener)) opener.focus();
    };
  }, []);

  // While 导入 runs both keys are off; hold focus on the dialog so Esc and the Tab trap still apply.
  useEffect(() => {
    if (busy) dialogRef.current?.focus();
  }, [busy]);

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      if (!busy) onCancel();
      return;
    }
    if (event.key !== "Tab") return;
    // Keep Tab inside the dialog.
    const keys = Array.from(dialogRef.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? []);
    if (keys.length === 0) {
      event.preventDefault();
      return;
    }
    const first = keys[0];
    const last = keys[keys.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <div className="modal-backdrop">
      <section
        ref={dialogRef}
        className="dialog import-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="import-dialog-title"
        aria-busy={busy || undefined}
        tabIndex={-1}
        onKeyDown={onKeyDown}
      >
        <h2 id="import-dialog-title">导入设置</h2>
        <dl className="import-facts">
          {facts.map((fact) => (
            <div className="import-fact" key={fact.label}>
              <dt>{fact.label}</dt>
              <dd className="num">
                {fact.to === undefined ? (
                  fact.value
                ) : (
                  <>
                    <span className="import-from">{fact.value}</span>
                    <span className="import-arrow" aria-hidden="true">
                      →
                    </span>
                    <span className="import-sr">改为</span>
                    <span>{fact.to}</span>
                  </>
                )}
              </dd>
            </div>
          ))}
        </dl>
        <div className="dialog-actions">
          <button ref={cancelRef} type="button" className="button button-secondary" disabled={busy} onClick={onCancel}>
            取消
          </button>
          <button type="button" className="button button-primary" disabled={busy} onClick={onConfirm}>
            导入
          </button>
        </div>
      </section>
    </div>
  );
}
