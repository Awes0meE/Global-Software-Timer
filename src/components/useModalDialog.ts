import { useEffect, useRef, type RefObject } from "react";

/** The dialog's Tab stops: enabled buttons and anything given tabIndex 0 (the 成就海报 list). */
const TAB_STOPS = 'button:not(:disabled), [tabindex="0"]';

interface ModalOptions {
  /** Esc, unless `busy`. */
  onCancel: () => void;
  /** While true, Esc does nothing. */
  busy: boolean;
  /** Takes focus on open (the first Tab stop when left out). */
  initialFocus?: RefObject<HTMLElement | null>;
}

/**
 * Makes `dialogRef` (a dialog inside `.modal-backdrop`) modal, for the v0.4.2 glass dialogs: the rest of the
 * app (the page, the sidebar, a toast still showing) is inert while it is open, and Tab, Esc and focus are
 * handled for the whole document, so a click on the dialog's text or on the scrim cannot let focus out.
 * Focus starts on `initialFocus` and goes back to where it was (the key that opened the dialog) once the app
 * is no longer inert.
 */
export function useModalDialog(dialogRef: RefObject<HTMLElement | null>, { onCancel, busy, initialFocus }: ModalOptions) {
  const busyRef = useRef(busy);
  busyRef.current = busy;
  const cancelRef = useRef(onCancel);
  cancelRef.current = onCancel;
  const initialFocusRef = useRef(initialFocus);
  initialFocusRef.current = initialFocus;

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

    // In document order (some selector engines return a selector list group by group).
    const stops = () =>
      Array.from(dialog.querySelectorAll<HTMLElement>(TAB_STOPS)).sort((left, right) =>
        left.compareDocumentPosition(right) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1,
      );
    const focusInside = (last = false) => {
      const enabled = stops();
      (enabled.length === 0 ? dialog : last ? enabled[enabled.length - 1] : enabled[0]).focus();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        if (!busyRef.current) cancelRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const enabled = stops();
      const active = document.activeElement;
      const onStop = enabled.some((stop) => stop === active);
      if (!onStop) {
        // On the dialog itself (its text was clicked), on the scrim or anywhere else: step into the stops.
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
    const first = initialFocusRef.current?.current;
    if (first) first.focus();
    else focusInside();
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("focusin", onFocusIn);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("focusin", onFocusIn);
      for (const element of madeInert) element.removeAttribute("inert");
      if (opener && document.contains(opener)) opener.focus();
    };
  }, [dialogRef]);
}
