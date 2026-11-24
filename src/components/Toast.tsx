import { useEffect, useRef, useState } from "react";
import "./HeaderControls.css";

export const TOAST_DURATION_MS = 6000;

interface ToastProps {
  message: string;
  /** One key next to the message, such as 在文件夹中显示. */
  action?: { label: string; onClick: () => void };
  /** `error` reads as an alert (保存失败) instead of a status. */
  tone?: "error";
  durationMs?: number;
  /** Called when the toast has run its time; the parent removes it. */
  onDismiss: () => void;
}

/**
 * A glass toast at the bottom of the window. It hides itself after `durationMs`, but not while the pointer
 * rests on it or focus is inside it, so its key stays reachable.
 */
export function Toast({ message, action, tone, durationMs = TOAST_DURATION_MS, onDismiss }: ToastProps) {
  const [held, setHeld] = useState({ hover: false, focus: false });
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;
  const paused = held.hover || held.focus;

  // A new message, or letting go of the toast, starts the full time again.
  useEffect(() => {
    if (paused) return;
    const timer = window.setTimeout(() => dismissRef.current(), durationMs);
    return () => window.clearTimeout(timer);
  }, [message, paused, durationMs]);

  return (
    <div
      className={`toast${tone === "error" ? " is-error" : ""}`}
      role={tone === "error" ? "alert" : "status"}
      onPointerEnter={() => setHeld((current) => ({ ...current, hover: true }))}
      onPointerLeave={() => setHeld((current) => ({ ...current, hover: false }))}
      onFocus={() => setHeld((current) => ({ ...current, focus: true }))}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setHeld((current) => ({ ...current, focus: false }));
        }
      }}
    >
      <span className="toast-message">{message}</span>
      {action ? (
        <button type="button" className="hk hk-solo toast-action" onClick={action.onClick}>
          {action.label}
        </button>
      ) : null}
    </div>
  );
}
