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

/** `:hover` / `:focus-visible` when the engine knows them; false otherwise. */
function matchesState(element: Element | null, selector: string): boolean {
  try {
    return element?.matches(selector) ?? false;
  } catch {
    return false;
  }
}

/**
 * A glass toast at the bottom of the window. It stays mounted, with empty status and alert regions, so a
 * screen reader hears a message put into them; the glass shows only while there is a message. It hides
 * itself after `durationMs`, but not while the pointer rests on it or keyboard focus is inside it, so its
 * key stays reachable. Focus left on the key by a click does not hold it.
 */
export function Toast({ toast, durationMs = TOAST_DURATION_MS, onDismiss }: ToastProps) {
  const [held, setHeld] = useState({ hover: false, focus: false });
  const boxRef = useRef<HTMLDivElement>(null);
  // Focus that arrives while the pointer is pressed on the toast comes from a click, not the keyboard.
  const pressedRef = useRef(false);
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

  // Each new toast starts from what holds it now: a key that held the last one may be gone without a
  // focusout ever reaching React, and that must not hold this one.
  useEffect(() => {
    const box = boxRef.current;
    const active = document.activeElement;
    setHeld({
      hover: id !== undefined && matchesState(box, ":hover"),
      focus:
        id !== undefined &&
        !pressedRef.current &&
        active !== null &&
        active !== box &&
        (box?.contains(active) ?? false) &&
        matchesState(active, ":focus-visible"),
    });
  }, [id]);

  const isError = toast?.tone === "error";
  // Keyed by id: a fresh text node is an addition to the region, which is what gets announced.
  const text = toast ? <span key={toast.id}>{toast.message}</span> : null;

  return (
    <div
      ref={boxRef}
      className={`toast${toast ? "" : " is-idle"}${isError ? " is-error" : ""}`}
      onPointerEnter={() => setHeld((current) => ({ ...current, hover: true }))}
      onPointerLeave={() => {
        pressedRef.current = false;
        setHeld((current) => ({ ...current, hover: false }));
      }}
      onPointerDown={() => {
        pressedRef.current = true;
      }}
      onPointerUp={() => {
        pressedRef.current = false;
      }}
      onPointerCancel={() => {
        pressedRef.current = false;
      }}
      onFocus={(event) => {
        const keyboard = !pressedRef.current && matchesState(event.target, ":focus-visible");
        setHeld((current) => ({ ...current, focus: keyboard }));
      }}
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
