import { useLayoutEffect, useRef, type RefObject } from "react";

/**
 * v0.4.8 motion: short entrances when a page's content appears or changes, and exits for dialogs and
 * popovers, drawn with the Web Animations API (no library). Everything is skipped under 减少动画
 * (`data-motion="reduced"`) or the system's reduced-motion setting, and where `Element.animate` is missing.
 */

export const MOTION_EASE = "cubic-bezier(0.16, 1, 0.3, 1)";
export const MOTION_EASE_IN = "cubic-bezier(0.4, 0, 1, 1)";

export function motionReduced(): boolean {
  if (typeof document === "undefined") return true;
  if (document.documentElement.dataset.motion === "reduced") return true;
  return typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function canAnimate(element: Element | null | undefined): element is HTMLElement {
  return element instanceof HTMLElement && typeof element.animate === "function" && !motionReduced();
}

/** Preview-only variant switch (`data-motion-style`), "a" in the app. */
function motionStyle(): string {
  return document.documentElement.dataset.motionStyle ?? "a";
}

export type SwapDirection = "forward" | "back" | "none";

/** A page's content appears: it rises into place (style b: panel by panel). */
export function playEnter(element: Element | null | undefined): void {
  if (!canAnimate(element)) return;
  if (motionStyle() === "b") {
    const parts = Array.from(element.children).filter((child): child is HTMLElement => child instanceof HTMLElement);
    parts.slice(0, 8).forEach((part, index) => {
      part.animate(
        [
          { opacity: 0, transform: "translateY(12px)" },
          { opacity: 1, transform: "none" },
        ],
        { duration: 340, delay: index * 45, easing: MOTION_EASE, fill: "backwards" },
      );
    });
    return;
  }
  element.animate(
    [
      { opacity: 0, transform: "translateY(10px)" },
      { opacity: 1, transform: "none" },
    ],
    { duration: 280, easing: MOTION_EASE },
  );
}

/** The content swaps for another day or range: it slides in from the side it comes from, or fades. */
export function playSwap(element: Element | null | undefined, direction: SwapDirection): void {
  if (!canAnimate(element)) return;
  const shift = direction === "forward" ? 28 : direction === "back" ? -28 : 0;
  if (motionStyle() === "b" || shift === 0) {
    element.animate(
      [
        { opacity: 0.25, filter: "blur(2px)", transform: "scale(0.995)" },
        { opacity: 1, filter: "none", transform: "none" },
      ],
      { duration: 260, easing: MOTION_EASE },
    );
    return;
  }
  element.animate(
    [
      { opacity: 0, transform: `translateX(${shift}px)` },
      { opacity: 1, transform: "none" },
    ],
    { duration: 300, easing: MOTION_EASE },
  );
}

function directionOf(previous: string, next: string): SwapDirection {
  if (previous === next) return "none";
  return next > previous ? "forward" : "back";
}

/**
 * Plays `playEnter` on `ref` when `contentKey` first has a value (the page's data is on screen) and
 * `playSwap` whenever it changes after that. `order` (a date, a range start) gives the slide direction;
 * without it the swap fades. Runs before paint, so the new content never shows a frame unmoved.
 */
export function useContentMotion(
  ref: RefObject<HTMLElement | null>,
  contentKey: string | null,
  order?: string | null,
): void {
  const shown = useRef<{ key: string; order: string | null } | null>(null);
  useLayoutEffect(() => {
    if (contentKey === null) {
      shown.current = null;
      return;
    }
    const previous = shown.current;
    shown.current = { key: contentKey, order: order ?? null };
    if (previous === null) {
      playEnter(ref.current);
    } else if (previous.key !== contentKey) {
      const direction = previous.order !== null && order ? directionOf(previous.order, order) : "none";
      playSwap(ref.current, direction);
    }
  }, [contentKey, order, ref]);
}

/**
 * Lets `node` (a dialog's backdrop, a popover) leave with an animation although React removes it at once:
 * a copy is put back in `parent`, marked inert and hidden from assistive tech, plays `keyframes` (and
 * whatever `alsoAnimate` adds to the copy) and is removed. Call it from a layout-effect cleanup. The copy is
 * made a microtask later, and only if `node` has really left the page (StrictMode's trial unmount keeps it).
 */
export function playExitGhost(
  node: HTMLElement | null,
  parent: Element | null,
  keyframes: Keyframe[],
  duration: number,
  alsoAnimate?: (ghost: HTMLElement) => void,
): void {
  if (!node || !parent || !canAnimate(node)) return;
  // Scroll positions are gone once the node is out of the page, so read them now.
  const scrolled = Array.from(node.querySelectorAll<HTMLElement>("*"))
    .map((element, index) => [index, element.scrollTop] as const)
    .filter(([, top]) => top > 0);
  queueMicrotask(() => {
    if (node.isConnected || !parent.isConnected) return;
    const ghost = node.cloneNode(true) as HTMLElement;
    ghost.setAttribute("aria-hidden", "true");
    ghost.setAttribute("inert", "");
    ghost.removeAttribute("id");
    ghost.querySelectorAll("[id]").forEach((element) => element.removeAttribute("id"));
    ghost.style.pointerEvents = "none";
    ghost.dataset.exitGhost = "";
    parent.append(ghost);
    if (scrolled.length > 0) {
      const copies = Array.from(ghost.querySelectorAll<HTMLElement>("*"));
      for (const [index, top] of scrolled) {
        if (copies[index]) copies[index].scrollTop = top;
      }
    }
    const animation = ghost.animate(keyframes, { duration, easing: MOTION_EASE_IN, fill: "forwards" });
    alsoAnimate?.(ghost);
    const remove = () => ghost.remove();
    animation.addEventListener("finish", remove);
    animation.addEventListener("cancel", remove);
    // A hidden window draws no frames, so the animation may never finish: the copy goes anyway.
    window.setTimeout(remove, duration + 200);
  });
}

/**
 * On close the dialog's scrim fades and the dialog (`dialogRef`, a child of its `.modal-backdrop`) sinks a
 * little, instead of vanishing.
 */
export function useDialogExit(dialogRef: RefObject<HTMLElement | null>): void {
  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    const backdrop = dialog?.parentElement ?? null;
    const parent = backdrop?.parentElement ?? null;
    return () => {
      if (!dialog || !backdrop) return;
      const index = Array.from(backdrop.children).indexOf(dialog);
      playExitGhost(backdrop, parent, [{ opacity: 1 }, { opacity: 0 }], 200, (ghost) => {
        ghost.children[index]?.animate([{ transform: "none" }, { transform: "translateY(6px) scale(0.97)" }], {
          duration: 200,
          easing: MOTION_EASE_IN,
          fill: "forwards",
        });
      });
    };
  }, [dialogRef]);
}

interface SlotRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

function slotRect(container: HTMLElement, target: HTMLElement): SlotRect {
  const outer = container.getBoundingClientRect();
  const inner = target.getBoundingClientRect();
  return {
    x: inner.left - outer.left - container.clientLeft,
    y: inner.top - outer.top - container.clientTop,
    width: inner.width,
    height: inner.height,
  };
}

/**
 * The selected key's face (the sidebar's raised key, a segmented control's thumb) glides from the key that
 * was selected to the new one instead of jumping: a copy of the face (`.glide-puck`) runs under the keys
 * while the new key's own face waits, then hands over. `container` must be `position: relative` and
 * `isolation: isolate` so the copy sits above its background and below its keys.
 */
export function useSelectionGlide(
  ref: RefObject<HTMLElement | null>,
  selector: string,
  selectedKey: string | number | null,
): void {
  const last = useRef<SlotRect | null>(null);
  useLayoutEffect(() => {
    const container = ref.current;
    const target = container?.querySelector<HTMLElement>(selector) ?? null;
    if (!container || !target) {
      last.current = null;
      return;
    }
    const to = slotRect(container, target);
    const from = last.current;
    last.current = to;
    if (!from || !canAnimate(target) || (from.x === to.x && from.y === to.y)) return;

    const face = window.getComputedStyle(target);
    const puck = document.createElement("span");
    puck.className = "glide-puck";
    puck.setAttribute("aria-hidden", "true");
    Object.assign(puck.style, {
      position: "absolute",
      left: `${to.x}px`,
      top: `${to.y}px`,
      width: `${to.width}px`,
      height: `${to.height}px`,
      zIndex: "-1",
      pointerEvents: "none",
      borderRadius: face.borderRadius,
      backgroundColor: face.backgroundColor,
      backgroundImage: face.backgroundImage,
      boxShadow: face.boxShadow,
    });
    container.appendChild(puck);
    const saved = target.getAttribute("style");
    target.style.setProperty("transition", "none");
    target.style.setProperty("background", "transparent");
    target.style.setProperty("box-shadow", "none");

    const animation = puck.animate(
      [
        {
          transform: `translate(${from.x - to.x}px, ${from.y - to.y}px)`,
          width: `${from.width}px`,
          height: `${from.height}px`,
        },
        { transform: "none", width: `${to.width}px`, height: `${to.height}px` },
      ],
      { duration: 340, easing: MOTION_EASE },
    );
    const handOver = () => {
      puck.remove();
      if (saved === null) target.removeAttribute("style");
      else target.setAttribute("style", saved);
    };
    animation.addEventListener("finish", handOver);
    animation.addEventListener("cancel", handOver);
    // A later change while this one runs starts from where the face is shown now.
    return () => animation.finish();
  }, [ref, selector, selectedKey]);
}
