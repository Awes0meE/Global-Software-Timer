import { useEffect, useRef } from "react";
import type { SettingChange, SettingsImportKey, SettingsImportPreview } from "../api";
import { ACCENT_PRESETS, EINK_PALETTES, START_PAGE_NAMES } from "../appearancePresets";
import { useModalDialog } from "./useModalDialog";
import "./SettingsImportDialog.css";

export interface ImportFact {
  label: string;
  /** A count such as "+2", or for a setting the value it has now. */
  value: string;
  /** For a setting: the value the import sets. */
  to?: string;
}

const SETTING_LABELS: Record<SettingsImportKey, string> = {
  theme: "主题",
  duration_format: "显示分钟数",
  close_behavior: "关闭窗口",
  accent: "主题色",
  eink: "墨水屏配色",
  week_start: "每周起始日",
  start_page: "启动时打开",
  reduce_motion: "减少动画",
};

const names = (items: readonly { id: string; name: string }[]) =>
  Object.fromEntries(items.map((item) => [item.id, item.name]));

const VALUE_LABELS: Record<SettingsImportKey, Record<string, string>> = {
  theme: { system: "跟随系统", light: "浅色", dark: "深色" },
  duration_format: { decimal_hours: "已关闭", hours_minutes: "已开启" },
  close_behavior: { minimize_to_tray: "最小化到后台", exit: "直接退出" },
  accent: names(ACCENT_PRESETS),
  eink: names(EINK_PALETTES),
  week_start: { monday: "周一", sunday: "周日" },
  start_page: START_PAGE_NAMES,
  reduce_motion: { system: "跟随系统", reduce: "开启" },
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
    { label: "本机没有的软件", value: String(preview.unmatched) },
    { label: "已在另一列表", value: String(preview.conflicts) },
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

  // While 导入 runs both keys are off; hold focus on the dialog so Esc and the Tab trap still apply.
  useEffect(() => {
    if (busy) dialogRef.current?.focus();
  }, [busy]);

  // Modal (useModalDialog): focus starts on 取消 and returns to the 迁移与备份 key.
  useModalDialog(dialogRef, { onCancel, busy, initialFocus: cancelRef });

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
        className="dialog import-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="import-dialog-title"
        aria-busy={busy || undefined}
        tabIndex={-1}
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
