import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from "react";

interface Popover {
  open: boolean;
  setOpen: (open: boolean) => void;
  toggle: () => void;
  /** Closes and puts focus back on the trigger, as after a pick from the popover. */
  closeToTrigger: () => void;
  /** Wraps the trigger and the popover: a press outside it closes the popover. */
  rootRef: RefObject<HTMLDivElement>;
  triggerRef: RefObject<HTMLButtonElement>;
}

/**
 * Open state of a header popover (calendar or menu) with its dismissal rules: Escape and a press outside
 * close it and hand focus back to the trigger; focus moving to a control outside closes it and stays there.
 */
export function usePopover(): Popover {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const closeToTrigger = useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus();
  }, []);
  const toggle = useCallback(() => setOpen((current) => !current), []);

  useEffect(() => {
    if (!open) return;
    const root = rootRef.current;

    const onPointerDown = (event: PointerEvent) => {
      if (root?.contains(event.target as Node)) return;
      setOpen(false);
      // The press may land on another control, which then takes focus; only an empty spot leaves focus
      // nowhere (or inside the closed popover), and then it goes back to the trigger. The check runs after
      // the press's own focus change, and outlives this effect, which closing the popover cleans up.
      window.setTimeout(() => {
        const active = document.activeElement;
        if (!active || active === document.body || root?.contains(active)) triggerRef.current?.focus();
      }, 0);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      closeToTrigger();
    };
    const onFocusOut = (event: FocusEvent) => {
      const next = event.relatedTarget as Node | null;
      if (next && !root?.contains(next)) setOpen(false);
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    root?.addEventListener("focusout", onFocusOut);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      root?.removeEventListener("focusout", onFocusOut);
    };
  }, [open, closeToTrigger]);

  return { open, setOpen, toggle, closeToTrigger, rootRef, triggerRef };
}

/**
 * The popover hangs off its trigger's wrapper, whose edges can land on fractional pixels (the page title's
 * width is not whole). Pixel type inside it must sit on whole device pixels, so this nudges the popover by
 * the remainder: a left-anchored popover by its wrapper's left edge, a right-anchored one by its right edge.
 */
export function usePixelSnap(
  open: boolean,
  anchorRef: RefObject<HTMLElement>,
  align: "start" | "end",
  gap = 8,
): CSSProperties | undefined {
  const [snap, setSnap] = useState<CSSProperties | undefined>(undefined);

  useLayoutEffect(() => {
    if (!open) {
      setSnap(undefined);
      return;
    }
    const measure = () => {
      const anchor = anchorRef.current;
      if (!anchor) return;
      const rect = anchor.getBoundingClientRect();
      const ratio = window.devicePixelRatio || 1;
      const remainder = (value: number) => Math.round(value * ratio) / ratio - value;
      setSnap({
        marginTop: remainder(rect.bottom + gap),
        ...(align === "start" ? { marginLeft: remainder(rect.left) } : { marginRight: -remainder(rect.right) }),
      });
    };
    measure();
    // Window size and display scale both move the wrapper's edges.
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [open, anchorRef, align, gap]);

  return snap;
}
