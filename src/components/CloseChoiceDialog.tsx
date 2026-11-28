import { useRef } from "react";
import clockMark from "../assets/gst-clock.svg";
import type { CloseBehavior } from "../api";
import { useModalDialog } from "./useModalDialog";

interface CloseChoiceDialogProps {
  error: string | null;
  busy: boolean;
  onChoose: (choice: CloseBehavior) => void;
}

const stay = () => {};

/**
 * The first-close choice (v0.1.2). It can open over another glass dialog (成就海报, 导入设置), so it is
 * modal itself (useModalDialog): Tab and focus stay in it, the dialog underneath yields, and focus goes back
 * there once a choice is made. Esc does nothing: the window has to be closed one way or the other.
 */
export function CloseChoiceDialog({ error, busy, onChoose }: CloseChoiceDialogProps) {
  const dialogRef = useRef<HTMLElement>(null);
  const minimizeRef = useRef<HTMLButtonElement>(null);
  useModalDialog(dialogRef, { onCancel: stay, busy, initialFocus: minimizeRef });

  return (
    <div className="modal-backdrop">
      <section
        ref={dialogRef}
        className="dialog close-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="close-dialog-title"
        aria-describedby="close-dialog-note"
        tabIndex={-1}
      >
        <img className="dialog-mark" src={clockMark} alt="" width={40} height={40} />
        <h2 id="close-dialog-title">关闭全局软件计时器</h2>
        <p id="close-dialog-note">GST 在后台运行时也会照常记录，退出后就不再记录。</p>
        {error ? <p className="dialog-error">{error}</p> : null}
        <div className="dialog-actions">
          <button type="button" className="button button-secondary" disabled={busy} onClick={() => onChoose("exit")}>
            退出软件
          </button>
          <button
            ref={minimizeRef}
            type="button"
            className="button button-primary"
            disabled={busy}
            onClick={() => onChoose("minimize_to_tray")}
          >
            最小化到后台
          </button>
        </div>
      </section>
    </div>
  );
}
