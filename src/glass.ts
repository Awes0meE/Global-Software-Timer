import { getTransparencyEffectsEnabled } from "./api";

/** Opaque panels when Windows transparency effects are off; glass otherwise. */
export function applyGlass(enabled: boolean): void {
  if (enabled) {
    delete document.documentElement.dataset.glass;
  } else {
    document.documentElement.dataset.glass = "off";
  }
}

/**
 * Reads the Windows setting now and whenever the window becomes visible again.
 * Anything but `false` (an error, a test double, the browser preview) keeps glass on.
 * Returns a cleanup that stops listening.
 */
export function startTransparencyWatch(
  read: () => Promise<unknown> = getTransparencyEffectsEnabled,
): () => void {
  // Each read gets a number; a slower, older read never overwrites a newer one.
  let latest = 0;

  const check = () => {
    if (document.hidden) return;
    const request = ++latest;
    const settle = (enabled: boolean) => {
      if (request === latest) applyGlass(enabled);
    };
    let pending: Promise<unknown>;
    try {
      pending = Promise.resolve(read());
    } catch {
      settle(true);
      return;
    }
    pending.then(
      (value) => settle(value !== false),
      () => settle(true),
    );
  };

  document.addEventListener("visibilitychange", check);
  check();
  return () => {
    latest += 1;
    document.removeEventListener("visibilitychange", check);
  };
}
