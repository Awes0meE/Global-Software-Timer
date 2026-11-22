import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockInvoke = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/core", () => ({
  invoke: mockInvoke,
}));

import { applyGlass, startTransparencyWatch } from "../glass";

const root = document.documentElement;

function setHidden(hidden: boolean) {
  Object.defineProperty(document, "hidden", { configurable: true, value: hidden });
  document.dispatchEvent(new Event("visibilitychange"));
}

/** Lets resolved invoke promises and their `.then` handlers run. */
async function settle() {
  for (let i = 0; i < 5; i += 1) {
    await Promise.resolve();
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

beforeEach(() => {
  mockInvoke.mockReset();
  delete root.dataset.glass;
  Object.defineProperty(document, "hidden", { configurable: true, value: false });
});

afterEach(() => {
  delete (document as unknown as { hidden?: boolean }).hidden;
  delete root.dataset.glass;
});

describe("applyGlass", () => {
  it("marks the root only when glass is off", () => {
    applyGlass(false);
    expect(root.dataset.glass).toBe("off");
    applyGlass(true);
    expect(root.hasAttribute("data-glass")).toBe(false);
  });
});

describe("startTransparencyWatch", () => {
  it("asks Windows through the read-only command by default", async () => {
    mockInvoke.mockResolvedValue(false);
    const stop = startTransparencyWatch();
    await settle();
    expect(mockInvoke).toHaveBeenCalledWith("get_transparency_effects_enabled");
    expect(root.dataset.glass).toBe("off");
    stop();
  });

  it("turns glass off for false and back on for true", async () => {
    const read = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    const stop = startTransparencyWatch(read);
    await settle();
    expect(root.dataset.glass).toBe("off");
    setHidden(true);
    setHidden(false);
    await settle();
    expect(read).toHaveBeenCalledTimes(2);
    expect(root.hasAttribute("data-glass")).toBe(false);
    stop();
  });

  it.each([
    ["undefined", () => Promise.resolve(undefined)],
    ["an object", () => Promise.resolve({ enabled: false })],
    ["a rejection", () => Promise.reject(new Error("no such command"))],
    ["a thrown error", () => {
      throw new Error("not in Tauri");
    }],
  ])("keeps glass on when the read gives %s", async (_label, read) => {
    root.dataset.glass = "off";
    const stop = startTransparencyWatch(read as () => Promise<unknown>);
    await settle();
    expect(root.hasAttribute("data-glass")).toBe(false);
    stop();
  });

  it("does not read while hidden, and reads again when the window becomes visible", async () => {
    Object.defineProperty(document, "hidden", { configurable: true, value: true });
    const read = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    const stop = startTransparencyWatch(read);
    await settle();
    expect(read).not.toHaveBeenCalled();
    setHidden(false);
    await settle();
    expect(read).toHaveBeenCalledTimes(1);
    expect(root.dataset.glass).toBe("off");
    setHidden(true);
    await settle();
    expect(read).toHaveBeenCalledTimes(1);
    setHidden(false);
    await settle();
    expect(read).toHaveBeenCalledTimes(2);
    expect(root.hasAttribute("data-glass")).toBe(false);
    stop();
  });

  it("stops listening after cleanup", async () => {
    const read = vi.fn().mockResolvedValue(false);
    const stop = startTransparencyWatch(read);
    await settle();
    expect(read).toHaveBeenCalledTimes(1);
    stop();
    setHidden(true);
    setHidden(false);
    await settle();
    expect(read).toHaveBeenCalledTimes(1);
  });

  it("applies only the latest read when a slow one finishes late", async () => {
    const slow = deferred<unknown>();
    const fast = deferred<unknown>();
    const read = vi.fn().mockReturnValueOnce(slow.promise).mockReturnValueOnce(fast.promise);
    const stop = startTransparencyWatch(read);
    setHidden(true);
    setHidden(false);
    expect(read).toHaveBeenCalledTimes(2);
    fast.resolve(true);
    await settle();
    expect(root.hasAttribute("data-glass")).toBe(false);
    slow.resolve(false);
    await settle();
    expect(root.hasAttribute("data-glass")).toBe(false);
    stop();
  });
});
