import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn().mockResolvedValue({
    product_title: "全局软件计时器",
    locale: "zh-CN",
    most_used: null,
    recorded_today_seconds: 0,
    active_today_seconds: 0,
    apps: [],
  }),
}));

import App from "../App";

describe("App", () => {
  it("renders the Chinese product title and recording status", async () => {
    render(<App />);

    expect(await screen.findByText("全局软件计时器")).toBeInTheDocument();
    expect(screen.getByText("正在记录")).toBeInTheDocument();
  });
});
