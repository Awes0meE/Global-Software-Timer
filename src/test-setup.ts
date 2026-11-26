import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";

// First-frame caches (gst.theme, gst.appearance, …) must not leak from one test into the next.
afterEach(() => {
  try {
    window.localStorage.clear();
  } catch {
    // Some tests replace Storage on purpose.
  }
});
