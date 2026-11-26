import { render, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";

// The preview mock reads its query once, at import (spec §J): this file runs App against it at one URL.
const seen = vi.hoisted(() => {
  window.history.replaceState(null, "", "/?startpage=statistics");
  return { settingsLoaded: false };
});

vi.mock("@tauri-apps/api/core", async () => {
  const preview = await import("../../scripts/ui-preview/tauri-core");
  return {
    invoke: async (command: string, ...rest: unknown[]) => {
      const value = await (preview.invoke as (command: string, ...rest: unknown[]) => Promise<unknown>)(command, ...rest);
      if (command === "get_app_settings") seen.settingsLoaded = true;
      return value;
    },
  };
});
vi.mock("@tauri-apps/api/window", () => import("../../scripts/ui-preview/tauri-window"));
vi.mock("@tauri-apps/plugin-autostart", () => import("../../scripts/ui-preview/autostart"));

import App from "../App";

const activeNav = () => document.querySelector('.nav-key[aria-current="page"]')?.textContent?.trim();

it("keeps the preview on 概览 when ?startpage names another page and ?page is not given", async () => {
  render(<App />);

  await waitFor(() => expect(seen.settingsLoaded).toBe(true));
  // Give App's one-time start-page switch (§E) every chance to fire.
  await new Promise((resolve) => window.setTimeout(resolve, 200));
  expect(activeNav()).toBe("概览");
  window.history.replaceState(null, "", "/");
});
