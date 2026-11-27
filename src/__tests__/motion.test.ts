import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useRef } from "react";
import { applyMotionSpeed, motionScale, playExitGhost, runSwap, useContentSwap, useSelectionGlide } from "../motion";

const root = document.documentElement;

/** The view-transition entry point, loosely typed so a test can put a stand-in there. */
const doc = document as unknown as { startViewTransition?: unknown };

/** A stand-in for the browser's view transitions: runs the update at once and records the swap kind. */
function fakeViewTransitions() {
  const kinds: (string | undefined)[] = [];
  doc.startViewTransition = (update: () => void) => {
    kinds.push(root.dataset.swap);
    update();
    return { ready: Promise.resolve(), finished: Promise.resolve() };
  };
  return kinds;
}

afterEach(() => {
  delete doc.startViewTransition;
  delete root.dataset.swap;
  delete root.dataset.speed;
  delete root.dataset.motion;
});

describe("动画速度", () => {
  it("marks fast and slow on the root, leaves 中 unmarked, and scales durations", () => {
    expect(motionScale()).toBe(1);
    applyMotionSpeed("fast");
    expect(root.dataset.speed).toBe("fast");
    expect(motionScale()).toBe(0.6);
    applyMotionSpeed("slow");
    expect(motionScale()).toBe(1.5);
    applyMotionSpeed("normal");
    expect(root.dataset.speed).toBeUndefined();
    expect(motionScale()).toBe(1);
  });
});

describe("runSwap", () => {
  it("updates at once without view transitions or under 减少动画", () => {
    const update = vi.fn();
    runSwap("page", update);
    expect(update).toHaveBeenCalledTimes(1);

    const kinds = fakeViewTransitions();
    root.dataset.motion = "reduced";
    runSwap("page", update);
    expect(update).toHaveBeenCalledTimes(2);
    expect(kinds).toEqual([]);
  });

  it("runs the update inside a view transition marked with its kind", async () => {
    const kinds = fakeViewTransitions();
    const update = vi.fn();
    runSwap("forward", update);
    expect(update).toHaveBeenCalledTimes(1);
    expect(kinds).toEqual(["forward"]);
    await act(async () => {});
    expect(root.dataset.swap).toBeUndefined();
  });

  it("runs the update itself when the window draws no frame for the transition", () => {
    vi.useFakeTimers();
    try {
      const skip = vi.fn();
      doc.startViewTransition = () => ({ ready: Promise.resolve(), finished: new Promise(() => {}), skipTransition: skip });
      const update = vi.fn();
      runSwap("page", update);
      expect(update).not.toHaveBeenCalled();
      vi.advanceTimersByTime(500);
      expect(update).toHaveBeenCalledTimes(1);
      expect(skip).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("ignores a transition skipped by a quicker next one", async () => {
    const rejected = Promise.reject(new DOMException("skipped", "AbortError"));
    doc.startViewTransition = (update: () => void) => {
      update();
      return { ready: rejected, finished: Promise.resolve() };
    };
    const unhandled = vi.fn();
    window.addEventListener("unhandledrejection", unhandled);
    runSwap("page", () => {});
    await act(async () => {});
    window.removeEventListener("unhandledrejection", unhandled);
    expect(unhandled).not.toHaveBeenCalled();
  });
});

describe("useContentSwap", () => {
  it("swaps only other content, with the side from the order, and refreshes plainly", async () => {
    const kinds = fakeViewTransitions();
    const { result } = renderHook(() => useContentSwap());
    const update = vi.fn();
    // Each swap settles before the next read lands, as reads land seconds apart.
    const read = async (key: string, order: string | null) => {
      result.current(key, order, update);
      await act(async () => {});
    };

    await read("2026-11-27", "2026-11-27"); // first content: fades in
    await read("2026-11-27", "2026-11-27"); // the same day polled again: no swap
    await read("2026-11-26", "2026-11-26"); // an earlier day
    await read("2026-11-27", "2026-11-27"); // a later day
    await read("a|b|true", null); // no order: fades

    expect(update).toHaveBeenCalledTimes(5);
    expect(kinds).toEqual(["fade", "back", "forward", "fade"]);
  });

  it("draws a page's first read into a page swap that still runs", () => {
    const kinds: (string | undefined)[] = [];
    doc.startViewTransition = (update: () => void) => {
      kinds.push(root.dataset.swap);
      update();
      return { ready: Promise.resolve(), finished: new Promise<void>(() => {}) };
    };
    const update = vi.fn();
    runSwap("page", update);
    const { result } = renderHook(() => useContentSwap());
    result.current("software", null, update);
    expect(update).toHaveBeenCalledTimes(2);
    expect(kinds).toEqual(["page"]);
  });

  it("only records content read while another page is on screen", () => {
    const kinds = fakeViewTransitions();
    const { result } = renderHook(() => useContentSwap());
    const update = vi.fn();
    result.current("2026-11-26", "2026-11-26", update, false);
    result.current("2026-11-26", "2026-11-26", update); // the same day once the page shows: no swap either
    expect(update).toHaveBeenCalledTimes(2);
    expect(kinds).toEqual([]);
  });

  it("needs no swap for the content already shown at mount", () => {
    const kinds = fakeViewTransitions();
    const { result } = renderHook(() => useContentSwap("software"));
    result.current("software", null, () => {});
    expect(kinds).toEqual([]);
  });
});

/** Element.animate is missing from jsdom: a recording stand-in. */
function stubAnimate() {
  const calls: { target: Element; keyframes: Keyframe[] }[] = [];
  const original = Element.prototype.animate;
  Element.prototype.animate = function (this: Element, keyframes: Keyframe[] | PropertyIndexedKeyframes | null) {
    calls.push({ target: this, keyframes: keyframes as Keyframe[] });
    return { addEventListener: () => {}, finish: () => {} } as unknown as Animation;
  };
  return { calls, restore: () => (Element.prototype.animate = original) };
}

function rect(left: number, top: number, width: number, height: number): DOMRect {
  return { left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON: () => ({}) };
}

describe("useSelectionGlide", () => {
  it("glides from where the previously selected key is now, wearing the selected face", () => {
    const { calls, restore } = stubAnimate();
    try {
      const container = document.createElement("div");
      const first = document.createElement("button");
      const second = document.createElement("button");
      container.append(first, second);
      document.body.append(container);
      container.getBoundingClientRect = () => rect(0, 0, 300, 200);
      // The first key moved (the sidebar folded) after it was selected: the glide starts from where it is now.
      first.getBoundingClientRect = () => rect(10, 40, 60, 44);
      second.getBoundingClientRect = () => rect(10, 100, 60, 44);
      first.className = "is-selected";

      const { rerender } = renderHook(
        ({ selected }: { selected: string }) => {
          const ref = useRef<HTMLDivElement>(container);
          useSelectionGlide(ref, ".is-selected", selected);
        },
        { initialProps: { selected: "first" } },
      );
      first.className = "";
      second.className = "is-selected";
      rerender({ selected: "second" });

      const glide = calls.find((call) => (call.target as HTMLElement).classList.contains("glide-puck"));
      expect(glide?.keyframes[0]).toMatchObject({ transform: "translate(0px, -60px)", width: "60px", height: "44px" });
      // The key's own transition is stopped before its face is copied.
      expect(second.style.transition).toBe("none");
      container.remove();
    } finally {
      restore();
    }
  });
});

describe("playExitGhost", () => {
  it("copies what was typed into the leaving copy's fields", async () => {
    const { restore } = stubAnimate();
    try {
      const parent = document.createElement("div");
      const node = document.createElement("div");
      const input = document.createElement("input");
      node.append(input);
      parent.append(node);
      document.body.append(parent);
      input.value = "code";

      parent.removeChild(node);
      playExitGhost(node, parent, [{ opacity: 1 }, { opacity: 0 }], 200);
      await Promise.resolve();

      const copy = parent.querySelector<HTMLInputElement>("[data-exit-ghost] input");
      expect(copy?.value).toBe("code");
      parent.remove();
    } finally {
      restore();
    }
  });
});
