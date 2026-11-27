import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { applyMotionSpeed, motionScale, runSwap, useContentSwap } from "../motion";

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

  it("needs no swap for the content already shown at mount", () => {
    const kinds = fakeViewTransitions();
    const { result } = renderHook(() => useContentSwap("software"));
    result.current("software", null, () => {});
    expect(kinds).toEqual([]);
  });
});
