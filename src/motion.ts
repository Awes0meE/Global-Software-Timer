import { useCallback, useLayoutEffect, useRef, useSyncExternalStore, type RefObject } from "react";
import { flushSync } from "react-dom";

/**
 * v0.4.8 motion, with no library: page and content swaps dissolve through view transitions (`runSwap`), the
 * selected key glides (`useSelectionGlide`), and dialogs and popovers leave with an animation (`playExitGhost`). Everything is skipped under 减少动画
 * (`data-motion="reduced"`) or the system's reduced-motion setting, and where `Element.animate` is missing.
 */

export const MOTION_EASE = "cubic-bezier(0.16, 1, 0.3, 1)";
export const MOTION_EASE_IN = "cubic-bezier(0.4, 0, 1, 1)";

const MOTION_SCALES = { fast: 0.6, normal: 1, slow: 1.5 } as const;

/**
 * 动画速度 (v0.4.8): `data-speed` on <html>, which sets `--motion-scale` for the stylesheet's
 * swaps and entrances; the animations drawn here read it too. 中 (normal) leaves the attribute off.
 */
export function applyMotionSpeed(speed: keyof typeof MOTION_SCALES): void {
  const root = document.documentElement;
  if (speed === "normal") delete root.dataset.speed;
  else root.dataset.speed = speed;
}

/** The 动画速度 factor on durations: 快 0.6, 中 1, 慢 1.5. */
export function motionScale(): number {
  const speed = document.documentElement.dataset.speed;
  return speed === "fast" || speed === "slow" ? MOTION_SCALES[speed] : 1;
}

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

function subscribeSystemReducedMotion(onChange: () => void): () => void {
  if (typeof window.matchMedia !== "function") return () => {};
  const media = window.matchMedia(REDUCED_MOTION_QUERY);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

function systemReducedMotion(): boolean {
  return typeof window.matchMedia === "function" && window.matchMedia(REDUCED_MOTION_QUERY).matches;
}

/** Whether Windows asks for reduced motion (its 动画效果 off), followed live. */
export function useSystemReducedMotion(): boolean {
  return useSyncExternalStore(subscribeSystemReducedMotion, systemReducedMotion, () => false);
}

export function motionReduced(): boolean {
  if (typeof document === "undefined") return true;
  if (document.documentElement.dataset.motion === "reduced") return true;
  return systemReducedMotion();
}

function canAnimate(element: Element | null | undefined): element is HTMLElement {
  return element instanceof HTMLElement && typeof element.animate === "function" && !motionReduced();
}

export type SwapKind = "page" | "forward" | "back" | "fade";

type TransitionDocument = Document & {
  startViewTransition?: (update: () => void) => {
    ready: Promise<void>;
    finished: Promise<void>;
    skipTransition?: () => void;
  };
};

/**
 * Runs `update` (a React state change) inside a view transition: the browser keeps a picture of the page as
 * it was, React draws the new state at once, and the two dissolve into each other (styles.css, by
 * `data-swap`), so no frame is ever blank. Without motion, or without view transitions, it just updates.
 */
let runningSwap: object | null = null;

export function runSwap(kind: SwapKind, update: () => void): void {
  const doc = document as TransitionDocument;
  // A page's first read landing while the page swap still runs is drawn into the incoming page as it
  // fades in; a second transition would cut the first one short.
  if (motionReduced() || typeof doc.startViewTransition !== "function" || (runningSwap !== null && kind === "fade")) {
    update();
    return;
  }
  const root = document.documentElement;
  root.dataset.swap = kind;
  let updated = false;
  const updateOnce = () => {
    if (updated) return;
    updated = true;
    flushSync(update);
  };
  const transition = doc.startViewTransition(updateOnce);
  runningSwap = transition;
  // The browser runs the update on its next frame; a window that draws no frames (covered, or a hidden
  // preview pane) would hold the click back, so after a moment the update runs without the transition.
  window.setTimeout(() => {
    if (updated) return;
    updateOnce();
    transition.skipTransition?.();
  }, 500);
  // A quick second click skips this transition for the next one: the page is already updated, so the
  // rejection is expected.
  transition.ready.catch(() => {});
  const settle = () => {
    if (runningSwap !== transition) return;
    runningSwap = null;
    delete root.dataset.swap;
  };
  transition.finished.then(settle, settle);
}

interface ShownContent {
  key: string;
  order: string | null;
}

/**
 * For a page that reads its content: hands back a setter that swaps in new content through `runSwap` only
 * when it is other content than what is on screen (another day, another range), and plainly for a refresh of
 * the same content. `order` (a date, a range start) picks the side a swap comes from; without it, it fades.
 * `initialKey` is the content already on screen at mount (a cached read), which then needs no swap. With
 * `animate` false (content read while another page is on screen) it only records the content and updates.
 */
export function useContentSwap(initialKey: string | null = null) {
  const shown = useRef<ShownContent | null>(initialKey === null ? null : { key: initialKey, order: null });
  return useCallback((key: string, order: string | null, update: () => void, animate = true) => {
    const previous = shown.current;
    shown.current = { key, order };
    if (!animate || (previous !== null && previous.key === key)) {
      update();
      return;
    }
    const kind: SwapKind =
      previous !== null && previous.order !== null && order !== null && previous.order !== order
        ? order > previous.order
          ? "forward"
          : "back"
        : "fade";
    runSwap(kind, update);
  }, []);
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
  // A copy takes attributes only: what was typed into a field and what a canvas shows are copied by hand.
  const fields = Array.from(node.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("input, textarea"));
  const canvases = Array.from(node.querySelectorAll("canvas"));
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
    ghost.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("input, textarea").forEach((copy, index) => {
      if (fields[index]) copy.value = fields[index].value;
    });
    ghost.querySelectorAll("canvas").forEach((copy, index) => {
      const source = canvases[index];
      try {
        if (source && source.width > 0 && source.height > 0) copy.getContext("2d")?.drawImage(source, 0, 0);
      } catch {
        // A canvas the page cannot read back stays blank in the copy.
      }
    });
    const scaled = duration * motionScale();
    const animation = ghost.animate(keyframes, { duration: scaled, easing: MOTION_EASE_IN, fill: "forwards" });
    alsoAnimate?.(ghost);
    const remove = () => ghost.remove();
    animation.addEventListener("finish", remove);
    animation.addEventListener("cancel", remove);
    // A hidden window draws no frames, so the animation may never finish: the copy goes anyway.
    window.setTimeout(remove, scaled + 200);
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
          duration: 200 * motionScale(),
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
  // The key selected before; measured again at the next change, so a fold, resize or zoom in between
  // does not leave the glide starting from where the key used to be.
  const last = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    const container = ref.current;
    const target = container?.querySelector<HTMLElement>(selector) ?? null;
    const previous = last.current;
    last.current = target;
    if (!container || !target || !previous || previous === target || !container.contains(previous)) return;
    if (!canAnimate(target)) return;
    const to = slotRect(container, target);
    const from = slotRect(container, previous);
    if (from.x === to.x && from.y === to.y) return;

    const saved = target.getAttribute("style");
    // The key's own transition has just begun from its unselected look; stopping it first makes the
    // computed face the selected one the copy must wear.
    target.style.setProperty("transition", "none");
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
      { duration: 340 * motionScale(), easing: MOTION_EASE },
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
