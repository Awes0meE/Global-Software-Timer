import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { SoftwarePage } from "../components/SoftwarePage";
import type { SoftwarePageSummary } from "../api";

const invoke = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/api/core", () => ({ invoke }));

afterEach(() => { cleanup(); vi.useRealTimers(); invoke.mockReset(); });

it.each(["resolve", "reject"])("ignores an older poll that %ss after removing software", async (completion) => {
  vi.useFakeTimers();
  const initial: SoftwarePageSummary = {
    focused: [], discovered: [], hidden: [{
      identity_key: "test", display_name: "Test App", process_name: "test.exe",
      icon_data_url: null, today_runtime_seconds: 0, today_focused_seconds: 0,
      total_runtime_seconds: 0, total_focused_seconds: 0, last_opened_at: null,
      status: "closed", mark: "hidden",
    }],
  };
  let resolve!: (summary: SoftwarePageSummary) => void;
  let reject!: (error: Error) => void;
  const oldPoll = new Promise<SoftwarePageSummary>((ok, fail) => { resolve = ok; reject = fail; });
  let reads = 0;
  invoke.mockImplementation((command) => {
    if (command !== "get_software_page_summary") return Promise.resolve();
    reads += 1;
    return reads === 1 ? Promise.resolve(initial) : reads === 2 ? oldPoll
      : Promise.resolve({ focused: [], hidden: [], discovered: [] });
  });
  await act(async () => { render(<SoftwarePage onDefaultSummariesChanged={() => {}} />); });
  await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
  fireEvent.click(screen.getByRole("button", { name: /编辑/ }));
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: /移出.*Test App/ })); });
  expect(screen.queryByText("Test App")).not.toBeInTheDocument();
  await act(async () => {
    if (completion === "resolve") resolve(initial); else reject(new Error("old request failed"));
  });
  expect(screen.queryByText("Test App")).not.toBeInTheDocument();
  expect(screen.queryByText("无法读取软件列表")).not.toBeInTheDocument();
});
