import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockInvoke = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/core", () => ({
  invoke: mockInvoke,
}));

import {
  applyAppearance,
  cacheAppearance,
  defaultAppearance,
  paintInitialAppearance,
  readCachedAppearance,
  startAccentWatch,
} from "../appearance";
import { resolveAccent } from "../accent";

const root = document.documentElement;
const CACHE_KEY = "gst.appearance";

function setHidden(hidden: boolean) {
  Object.defineProperty(document, "hidden", { configurable: true, value: hidden });
  document.dispatchEvent(new Event("visibilitychange"));
}

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

function painted() {
  return {
    accent: root.dataset.accent,
    light: root.style.getPropertyValue("--user-accent-light"),
    dark: root.style.getPropertyValue("--user-accent-dark"),
    eink: root.dataset.eink,
    motion: root.dataset.motion,
  };
}

function cached(): unknown {
  return JSON.parse(window.localStorage.getItem(CACHE_KEY) ?? "null");
}

const WINDOWS_BLUE = { light: "#0067c0", dark: "#4cc2ff" };
const WINDOWS_YELLOW = { light: "#ffb900", dark: "#ffb900" };

function reset() {
  mockInvoke.mockReset();
  // Back to today's look, and forget the Windows pair the module remembers.
  applyAppearance({ ...defaultAppearance, windowsAccent: null });
  window.localStorage.clear();
  Object.defineProperty(document, "hidden", { configurable: true, value: false });
}

beforeEach(reset);
afterEach(() => {
  reset();
  delete (document as unknown as { hidden?: boolean }).hidden;
});

describe("applyAppearance", () => {
  it("leaves today's look unmarked: 蓝, 极光 and the system motion setting", () => {
    applyAppearance({ accent: "violet", eink: "night", motion: "reduce" });
    applyAppearance({ accent: "blue", eink: "aurora", motion: "system" });
    expect(painted()).toEqual({ accent: undefined, light: "", dark: "", eink: undefined, motion: undefined });
  });

  it("marks the root and sets the inline accent pair for a preset", () => {
    applyAppearance({ accent: "rose", eink: "warm", motion: "reduce" });
    expect(painted()).toEqual({ accent: "rose", light: "#d6336c", dark: "#ff7aa2", eink: "warm", motion: "reduced" });
  });

  it("follows Windows through the clamp, and falls back to 蓝 values with the accent glow", () => {
    applyAppearance({ accent: "system", windowsAccent: WINDOWS_YELLOW, eink: "aurora", motion: "system" });
    const clamped = resolveAccent("system", WINDOWS_YELLOW);
    expect(painted()).toMatchObject({ accent: "system", light: clamped.light, dark: clamped.dark });
    expect(clamped.light).not.toBe("#ffb900");

    applyAppearance({ accent: "system", windowsAccent: null, eink: "aurora", motion: "system" });
    expect(painted()).toMatchObject({ accent: "system", light: "#2f7de1", dark: "#5aa9ff" });
  });

  it("keeps the last Windows pair when a caller does not pass one", () => {
    applyAppearance({ accent: "system", windowsAccent: WINDOWS_BLUE, eink: "aurora", motion: "system" });
    applyAppearance({ accent: "green", eink: "aurora", motion: "system" });
    applyAppearance({ accent: "system", eink: "forest", motion: "system" });
    expect(painted()).toMatchObject({ accent: "system", light: "#0067c0", dark: "#4cc2ff", eink: "forest" });
  });

  it("caches the choice and the resolved Windows pair after every apply", () => {
    applyAppearance({ accent: "system", windowsAccent: WINDOWS_YELLOW, eink: "night", motion: "reduce" });
    expect(cached()).toEqual({ accent: "system", windows: resolveAccent("system", WINDOWS_YELLOW), eink: "night", motion: "reduce" });
  });
});

describe("the first-frame cache", () => {
  it("reads today's look when nothing is cached", () => {
    expect(readCachedAppearance()).toEqual({ accent: "blue", windowsAccent: null, eink: "aurora", motion: "system" });
  });

  it("round-trips through cacheAppearance", () => {
    cacheAppearance({ accent: "amber", windowsAccent: WINDOWS_BLUE, eink: "graphite", motion: "reduce" });
    expect(readCachedAppearance()).toEqual({ accent: "amber", windowsAccent: WINDOWS_BLUE, eink: "graphite", motion: "reduce" });
  });

  it.each([
    ["not JSON", "{"],
    ["not an object", '"system"'],
    ["null", "null"],
    ["unknown values", JSON.stringify({ accent: "teal", windows: { light: "#0067c0", dark: 4 }, eink: "sepia", motion: "always" })],
    ["a colour that is not #rrggbb", JSON.stringify({ accent: "system", windows: { light: "red", dark: "#4cc2ff" } })],
    ["a colour with CSS in it", JSON.stringify({ accent: "system", windows: { light: "#0067c0;--x:1", dark: "#4cc2ff" } })],
  ])("falls back field by field for %s", (_case, raw) => {
    window.localStorage.setItem(CACHE_KEY, raw);
    const appearance = readCachedAppearance();
    expect(appearance.windowsAccent).toBeNull();
    expect(["blue", "system"]).toContain(appearance.accent);
    expect(appearance.eink).toBe("aurora");
    expect(appearance.motion).toBe("system");
  });

  it("paints the cached appearance before React renders", () => {
    window.localStorage.setItem(
      CACHE_KEY,
      JSON.stringify({ accent: "system", windows: WINDOWS_BLUE, eink: "forest", motion: "reduce" }),
    );
    paintInitialAppearance();
    expect(painted()).toEqual({ accent: "system", light: "#0067c0", dark: "#4cc2ff", eink: "forest", motion: "reduced" });
  });

  it("paints today's look when storage throws", () => {
    const getItem = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    try {
      paintInitialAppearance();
      expect(painted()).toEqual({ accent: undefined, light: "", dark: "", eink: undefined, motion: undefined });
      expect(() => applyAppearance({ accent: "violet", eink: "aurora", motion: "system" })).not.toThrow();
    } finally {
      getItem.mockRestore();
      setItem.mockRestore();
    }
  });
});

describe("startAccentWatch", () => {
  it("reads nothing while the choice is not 跟随 Windows", async () => {
    applyAppearance({ accent: "green", eink: "aurora", motion: "system" });
    const read = vi.fn().mockResolvedValue(WINDOWS_BLUE);
    const stop = startAccentWatch(read);
    setHidden(true);
    setHidden(false);
    await settle();
    expect(read).not.toHaveBeenCalled();
    stop();
  });

  it("asks Windows through the read-only command by default", async () => {
    applyAppearance({ accent: "system", eink: "aurora", motion: "system" });
    mockInvoke.mockResolvedValue(WINDOWS_BLUE);
    const stop = startAccentWatch();
    await settle();
    expect(mockInvoke).toHaveBeenCalledWith("get_windows_accent");
    expect(painted()).toMatchObject({ light: "#0067c0", dark: "#4cc2ff" });
    expect(cached()).toMatchObject({ windows: WINDOWS_BLUE });
    stop();
  });

  it("re-reads when the window becomes visible again", async () => {
    applyAppearance({ accent: "system", eink: "aurora", motion: "system" });
    const read = vi.fn().mockResolvedValueOnce(WINDOWS_BLUE).mockResolvedValueOnce(WINDOWS_YELLOW);
    const stop = startAccentWatch(read);
    await settle();
    setHidden(true);
    await settle();
    expect(read).toHaveBeenCalledTimes(1);
    setHidden(false);
    await settle();
    expect(read).toHaveBeenCalledTimes(2);
    expect(painted().light).toBe(resolveAccent("system", WINDOWS_YELLOW).light);
    stop();
  });

  it("reads when the choice switches to 跟随 Windows", async () => {
    applyAppearance({ accent: "blue", eink: "aurora", motion: "system" });
    const read = vi.fn().mockResolvedValue(WINDOWS_BLUE);
    const stop = startAccentWatch(read);
    await settle();
    expect(read).not.toHaveBeenCalled();
    applyAppearance({ accent: "system", eink: "aurora", motion: "system" });
    await settle();
    expect(read).toHaveBeenCalledTimes(1);
    expect(painted()).toMatchObject({ accent: "system", light: "#0067c0" });
    stop();
  });

  it("uses 蓝 for an unreadable or malformed accent and keeps the pair on a failed read", async () => {
    applyAppearance({ accent: "system", windowsAccent: WINDOWS_BLUE, eink: "aurora", motion: "system" });
    const stopFailing = startAccentWatch(() => Promise.reject(new Error("no such command")));
    await settle();
    expect(painted().light).toBe("#0067c0");
    stopFailing();

    for (const value of [null, { light: "#0067c0" }, "#0067c0"]) {
      const stop = startAccentWatch(() => Promise.resolve(value));
      await settle();
      expect(painted(), JSON.stringify(value)).toMatchObject({ accent: "system", light: "#2f7de1", dark: "#5aa9ff" });
      stop();
      applyAppearance({ accent: "system", windowsAccent: WINDOWS_BLUE, eink: "aurora", motion: "system" });
    }
  });

  it("never lets an older, slower read overwrite a newer one", async () => {
    applyAppearance({ accent: "system", eink: "aurora", motion: "system" });
    const first = deferred<unknown>();
    const second = deferred<unknown>();
    const read = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const stop = startAccentWatch(read);
    setHidden(true);
    setHidden(false);
    second.resolve(WINDOWS_YELLOW);
    await settle();
    first.resolve(WINDOWS_BLUE);
    await settle();
    expect(painted().light).toBe(resolveAccent("system", WINDOWS_YELLOW).light);
    stop();
  });

  it("stops listening and drops pending reads after cleanup", async () => {
    applyAppearance({ accent: "system", eink: "aurora", motion: "system" });
    const pending = deferred<unknown>();
    const read = vi.fn().mockReturnValue(pending.promise);
    const stop = startAccentWatch(read);
    stop();
    pending.resolve(WINDOWS_YELLOW);
    await settle();
    expect(painted().light).toBe("#2f7de1");
    setHidden(true);
    setHidden(false);
    applyAppearance({ accent: "system", eink: "aurora", motion: "system" });
    expect(read).toHaveBeenCalledTimes(1);
  });
});
