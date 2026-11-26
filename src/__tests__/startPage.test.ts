import { afterEach, describe, expect, it, vi } from "vitest";
import { cacheStartPage, readCachedStartPage } from "../startPage";

// Spec §E: the first render reads the gst.startPage cache, the way gst.theme is read.
describe("start page cache", () => {
  afterEach(() => vi.restoreAllMocks());

  it("reads back a cached page", () => {
    cacheStartPage("statistics");
    expect(window.localStorage.getItem("gst.startPage")).toBe("statistics");
    expect(readCachedStartPage()).toBe("statistics");
  });

  it("normalises a missing or unknown page to 概览", () => {
    expect(readCachedStartPage()).toBe("overview");
    for (const value of ["settings", "timeline", "nonsense", ""]) {
      window.localStorage.setItem("gst.startPage", value);
      expect(readCachedStartPage()).toBe("overview");
    }
  });

  it("falls back to 概览 and keeps going when storage throws", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(readCachedStartPage()).toBe("overview");
    expect(() => cacheStartPage("software")).not.toThrow();
  });
});
