import { afterEach, describe, expect, it, vi } from "vitest";
import { startVisiblePolling } from "../visiblePolling";

function setHidden(hidden: boolean) {
  Object.defineProperty(document, "hidden", { configurable: true, value: hidden });
  document.dispatchEvent(new Event("visibilitychange"));
}

afterEach(() => {
  vi.useRealTimers();
  delete (document as unknown as { hidden?: boolean }).hidden;
});

describe("visible polling", () => {
  it("stops hidden requests, refreshes immediately on return, and cleans up", async () => {
    vi.useFakeTimers();
    setHidden(false);
    const refresh = vi.fn().mockResolvedValue(undefined);
    const stop = startVisiblePolling(refresh, 5000);
    await vi.advanceTimersByTimeAsync(5000);
    expect(refresh).toHaveBeenCalledTimes(2);
    setHidden(true);
    await vi.advanceTimersByTimeAsync(20000);
    expect(refresh).toHaveBeenCalledTimes(2);
    setHidden(false);
    await vi.advanceTimersByTimeAsync(0);
    expect(refresh).toHaveBeenCalledTimes(3);
    stop();
    setHidden(true);
    setHidden(false);
    await vi.advanceTimersByTimeAsync(10000);
    expect(refresh).toHaveBeenCalledTimes(3);
  });

  it("does not start hidden and does not overlap slow requests", async () => {
    vi.useFakeTimers();
    setHidden(true);
    let resolve!: () => void;
    const refresh = vi.fn(() => new Promise<void>((done) => { resolve = done; }));
    const stop = startVisiblePolling(refresh, 5000);
    await vi.advanceTimersByTimeAsync(5000);
    expect(refresh).not.toHaveBeenCalled();
    setHidden(false);
    await vi.advanceTimersByTimeAsync(20000);
    expect(refresh).toHaveBeenCalledTimes(1);
    resolve();
    await vi.advanceTimersByTimeAsync(5000);
    expect(refresh).toHaveBeenCalledTimes(2);
    stop();
    resolve();
  });
});
