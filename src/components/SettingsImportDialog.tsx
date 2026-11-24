import { useEffect, useRef } from "react";
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

  const busyRef = useRef(busy);
  busyRef.current = busy;
  const cancelHandlerRef = useRef(onCancel);
  cancelHandlerRef.current = onCancel;

  // Modal: the rest of the app (the page, the sidebar, a toast still showing) is inert while the
  // preview is open, and Tab, Esc and focus are handled for the whole document, so a click on the
  // dialog's text or on the scrim cannot let focus out. Focus starts on 取消 and goes back to where it
  // was (the 迁移与备份 key) once the app is no longer inert.
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = dialogRef.current;
    const backdrop = dialog?.parentElement;
    if (!dialog || !backdrop?.parentElement) return undefined;
    const madeInert = Array.from(backdrop.parentElement.children).filter(
      (element): element is HTMLElement =>
        element !== backdrop && element instanceof HTMLElement && !element.hasAttribute("inert"),
    );
    for (const element of madeInert) element.setAttribute("inert", "");

    const keys = () => Array.from(dialog.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"));
    const focusInside = (last = false) => {
      const enabled = keys();
      (enabled.length === 0 ? dialog : last ? enabled[enabled.length - 1] : enabled[0]).focus();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        if (!busyRef.current) cancelHandlerRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const enabled = keys();
      const active = document.activeElement;
      const onKey = enabled.some((key) => key === active);
      if (!onKey) {
        // On the dialog itself (its text was clicked), on the scrim or anywhere else: step into the keys.
        event.preventDefault();
        focusInside(event.shiftKey);
        return;
      }
      if (event.shiftKey && active === enabled[0]) {
        event.preventDefault();
        enabled[enabled.length - 1].focus();
      } else if (!event.shiftKey && active === enabled[enabled.length - 1]) {
        event.preventDefault();
        enabled[0].focus();
      }
    };
    const onFocusIn = (event: FocusEvent) => {
      if (event.target instanceof Node && !dialog.contains(event.target)) focusInside();
    };
    cancelRef.current?.focus();
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("focusin", onFocusIn);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("focusin", onFocusIn);
      for (const element of madeInert) element.removeAttribute("inert");
      if (opener && document.contains(opener)) opener.focus();
    };
  }, []);

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
