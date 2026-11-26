import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { SIDEBAR_NARROW_QUERY, SIDEBAR_STORAGE_KEY, useSidebarCollapse } from "../useSidebarCollapse";
import { allRules } from "./support/css";

const normalize = (text: string | undefined) => (text ?? "").replace(/\s+/g, " ").trim();
const rulesFor = (selector: string, media: string | null) =>
  Object.assign(
    {},
    ...allRules()
      .filter((rule) =>
        media === null ? rule.atRules.length === 0 : rule.atRules.length === 1 && normalize(rule.atRules[0]) === media,
      )
      .filter((rule) => rule.selectors.includes(selector))
      .map((rule) => rule.declarations),
  ) as Record<string, string>;
const topLevel = (selector: string) => rulesFor(selector, null);
const inMedia = (media: string, selector: string) => rulesFor(selector, media);

// A matchMedia stand-in whose narrow state the test flips.
function stubNarrow(initial: boolean) {
  const listeners = new Set<() => void>();
  const query = {
    matches: initial,
    media: SIDEBAR_NARROW_QUERY,
    addEventListener: (_: string, listener: () => void) => listeners.add(listener),
    removeEventListener: (_: string, listener: () => void) => listeners.delete(listener),
  };
  window.matchMedia = ((media: string) => {
    expect(media).toBe(SIDEBAR_NARROW_QUERY);
    return query;
  }) as unknown as typeof window.matchMedia;
  return {
    set(matches: boolean) {
      query.matches = matches;
      listeners.forEach((listener) => listener());
    },
  };
}

const original = window.matchMedia;
afterEach(() => {
  window.matchMedia = original;
});

// Apple HIG: people can hide the sidebar, and it gets out of the way when the window is narrow.
describe("sidebar collapse", () => {
  it("starts open in a wide window and remembers a collapse", () => {
    stubNarrow(false);
    const { result, unmount } = renderHook(() => useSidebarCollapse());
    expect(result.current.collapsed).toBe(false);

    act(() => result.current.toggle());
    expect(result.current.collapsed).toBe(true);
    expect(window.localStorage.getItem(SIDEBAR_STORAGE_KEY)).toBe("1");
    unmount();

    expect(renderHook(() => useSidebarCollapse()).result.current.collapsed).toBe(true);
  });

  it("folds into the rail by itself when the window gets narrow", () => {
    const media = stubNarrow(false);
    const { result } = renderHook(() => useSidebarCollapse());
    act(() => media.set(true));
    expect(result.current.collapsed).toBe(true);
    act(() => media.set(false));
    expect(result.current.collapsed).toBe(false);
  });

  it("opens in a narrow window until the width crosses back, without remembering it", () => {
    const media = stubNarrow(true);
    const { result } = renderHook(() => useSidebarCollapse());
    expect(result.current.collapsed).toBe(true);

    act(() => result.current.toggle());
    expect(result.current.collapsed).toBe(false);
    expect(window.localStorage.getItem(SIDEBAR_STORAGE_KEY)).toBeNull();

    act(() => media.set(false));
    act(() => media.set(true));
    expect(result.current.collapsed).toBe(true);
  });

  it("works without storage", () => {
    stubNarrow(false);
    const storage = Object.getOwnPropertyDescriptor(window, "localStorage");
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      get() {
        throw new Error("blocked");
      },
    });
    try {
      const { result } = renderHook(() => useSidebarCollapse());
      act(() => result.current.toggle());
      expect(result.current.collapsed).toBe(true);
    } finally {
      if (storage) Object.defineProperty(window, "localStorage", storage);
    }
  });

  it("draws the rail at 80px and keeps the hidden names readable by screen readers", () => {
    expect(topLevel(".app-shell.is-rail")["grid-template-columns"]).toBe("80px minmax(0, 1fr)");
    const hidden = topLevel(".is-rail .nav-key > span");
    expect(hidden["clip-path"]).toBe("inset(50%)");
    expect(hidden.display).toBeUndefined();
    expect(inMedia("@media (forced-colors: active)", ".is-rail .nav-key[data-label]::after").border).toBe(
      "1px solid CanvasText",
    );
  });
});
