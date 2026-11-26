import { cleanup, render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SoftwarePageRow } from "../api";
import { AddSoftwareDialog } from "../components/AddSoftwareDialog";
import { DiscoveredSoftwarePanel, FocusedSoftwarePanel } from "../components/SoftwarePanels";
import { WeekStartContext, type WeekStart } from "../weekStart";

beforeEach(() => {
  // Sunday 2026-06-07, local time. Only Date is faked.
  vi.useFakeTimers({ now: new Date(2026, 5, 7, 12, 0), toFake: ["Date"] });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

// Opened on Wednesday 2026-06-03.
const row: SoftwarePageRow = {
  identity_key: "code",
  display_name: "Visual Studio Code",
  process_name: "Code.exe",
  icon_url: null,
  today_runtime_seconds: 0,
  today_focused_seconds: 0,
  total_runtime_seconds: 3600,
  total_focused_seconds: 1800,
  last_opened_at: new Date(2026, 5, 3, 8, 0).toISOString(),
  status: "closed",
  mark: "focused",
};

function renderWith(weekStart: WeekStart | null, element: ReactElement) {
  render(weekStart === null ? element : <WeekStartContext.Provider value={weekStart}>{element}</WeekStartContext.Provider>);
}

const panels: Array<[string, () => ReactElement]> = [
  [
    "特别关注",
    () => (
      <FocusedSoftwarePanel rows={[row]} editing={false} onAdd={() => {}} onEditToggle={() => {}} onRemove={() => {}} />
    ),
  ],
  ["已发现软件", () => <DiscoveredSoftwarePanel rows={[row]} />],
  [
    "添加特别关注",
    () => <AddSoftwareDialog rows={[row]} target="focused" onClose={() => {}} onSubmit={async () => {}} />,
  ],
];

describe("软件 page last-opened text follows 每周起始日", () => {
  it.each(panels)("%s: Monday start by default reads 这周三", (_name, element) => {
    renderWith(null, element());
    expect(screen.getByText("这周三")).toBeInTheDocument();
  });

  it.each(panels)("%s: Sunday start reads 上周三", (_name, element) => {
    renderWith(0, element());
    expect(screen.getByText("上周三")).toBeInTheDocument();
    expect(screen.queryByText("这周三")).not.toBeInTheDocument();
  });
});
