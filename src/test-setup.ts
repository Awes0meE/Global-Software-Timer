import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { clearPageReads } from "./pageReads";

// First-frame caches (gst.theme, gst.appearance, …) must not leak from one test into the next.
afterEach(() => {
  clearPageReads();
  try {
    window.localStorage.clear();
  } catch {
    // Some tests replace Storage on purpose.
  }
});
