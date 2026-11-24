import { useEffect, useRef, useState } from "react";
import "./HeaderControls.css";

export const TOAST_DURATION_MS = 6000;

export interface ToastMessage {
  /** A new id for every toast, so the same text shown twice is announced and timed again. */
  id: number;
  message: string;
  /** One key next to the message, such as 在文件夹中显示. */
  action?: { label: string; onClick: () => void };
  /** `error` reads as an alert (保存失败) instead of a status. */
  tone?: "error";
}

interface ToastProps {
  /** The toast to show, or `null` for none. */
  toast: ToastMessage | null;
  durationMs?: number;
  /** Called when the toast has run its time; the parent sets `toast` back to `null`. */
  onDismiss: () => void;
}

/**
 * A glass toast at the bottom of the window. It stays mounted, with empty status and alert regions, so a
 * screen reader hears a message put into them; the glass shows only while there is a message. It hides
 * itself after `durationMs`, but not while the pointer rests on it or focus is inside it, so its key
 * stays reachable.
 */
export function Toast({ toast, durationMs = TOAST_DURATION_MS, onDismiss }: ToastProps) {
  const [held, setHeld] = useState({ hover: false, focus: false });
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;
  const paused = held.hover || held.focus;
  const id = toast?.id;

  // A new toast, or letting go of the toast, starts the full time again.
  useEffect(() => {
    if (id === undefined || paused) return;
    const timer = window.setTimeout(() => dismissRef.current(), durationMs);
    return () => window.clearTimeout(timer);
  }, [id, paused, durationMs]);

  // A toast that leaves under the pointer or with focus must not hold the next one.
  useEffect(() => {
    if (id === undefined) setHeld({ hover: false, focus: false });
  }, [id]);

  const isError = toast?.tone === "error";
  // Keyed by id: a fresh text node is an addition to the region, which is what gets announced.
  const text = toast ? <span key={toast.id}>{toast.message}</span> : null;

  return (
    <div
      className={`toast${toast ? "" : " is-idle"}${isError ? " is-error" : ""}`}
      onPointerEnter={() => setHeld((current) => ({ ...current, hover: true }))}
      onPointerLeave={() => setHeld((current) => ({ ...current, hover: false }))}
      onFocus={() => setHeld((current) => ({ ...current, focus: true }))}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setHeld((current) => ({ ...current, focus: false }));
        }
      }}
    >
      <span className="toast-message" role="status">
        {isError ? null : text}
      </span>
      <span className="toast-message" role="alert">
        {isError ? text : null}
      </span>
      {toast?.action ? (
        <button type="button" className="hk hk-solo toast-action" onClick={toast.action.onClick}>
          {toast.action.label}
        </button>
      ) : null}
    </div>
  );
}
