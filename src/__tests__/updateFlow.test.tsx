import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockInvoke, FakeChannel } = vi.hoisted(() => ({
  mockInvoke: vi.fn(),
  FakeChannel: class<T> {
    onmessage: (message: T) => void = () => {};
  },
}));

vi.mock("@tauri-apps/api/core", () => ({ invoke: mockInvoke, Channel: FakeChannel }));
vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({ onCloseRequested: () => Promise.resolve(() => {}) }),
}));
vi.mock("@tauri-apps/plugin-autostart", () => ({
  disable: vi.fn(async () => {}),
  enable: vi.fn(async () => {}),
  isEnabled: vi.fn(async () => true),
}));

import App from "../App";
import type { UpdateProgress } from "../api";
import { downloadFinished, formatDownloadProgress } from "../components/UpdateDialog";
import { paintInitialAppearance } from "../appearance";

const TODAY = "2026-11-24";
const MB = 1024 * 1024;
type Handler = (args: Record<string, unknown> | undefined) => unknown;

let overrides: Record<string, Handler>;

const found = { version: "0.4.7", current_version: "0.4.6", size_bytes: Math.round(6.3 * MB) };

const defaults: Record<string, Handler> = {
  get_app_settings: () => ({
    close_behavior: "minimize_to_tray",
    close_behavior_configured: true,
    autostart_enabled: true,
    autostart_configured: true,
    duration_format: "decimal_hours",
    duration_format_configured: true,
    theme: "light",
    theme_configured: true,
  }),
  get_calendar_summary: () => ({ today: TODAY, data_start_date: "2026-09-03" }),
  get_transparency_effects_enabled: () => true,
  get_windows_accent: () => ({ light: "#0067c0", dark: "#4cc2ff" }),
  get_restore_status: () => "none",
  get_dashboard_summary: () => ({
    last_scan_succeeded: true,
    product_title: "全局软件计时器",
    locale: "zh-CN",
    usage_date: TODAY,
    is_today: true,
    most_used: null,
    recorded_today_seconds: 0,
    active_today_seconds: 0,
    apps: [],
  }),
  get_background_page_summary: () => ({ logical_cores: 8, running_count: 0, rows: [], usage_date: TODAY, is_today: true }),
  get_software_page_summary: () => ({ focused: [], hidden: [], discovered: [] }),
  check_for_update: () => null,
  cancel_update: () => undefined,
  open_feedback_link: () => undefined,
};

beforeEach(() => {
  vi.useFakeTimers({ now: new Date(2026, 10, 24, 22, 1), toFake: ["Date"] });
  overrides = {};
  mockInvoke.mockImplementation(async (command: string, args?: Record<string, unknown>) => {
    const handler = overrides[command] ?? defaults[command];
    return handler ? handler(args) : undefined;
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  mockInvoke.mockReset();
  window.localStorage.clear();
  paintInitialAppearance();
});

const calls = (command: string) => mockInvoke.mock.calls.filter(([name]) => name === command);
const buttonTexts = (dialog: HTMLElement) => within(dialog).getAllByRole("button").map((button) => button.textContent);

async function openSettings() {
  render(<App />);
  await userEvent.click(await screen.findByRole("button", { name: "设置" }));
  await waitFor(() => expect(screen.getByRole("radio", { name: "蓝" })).toBeEnabled());
}

async function openConsent() {
  await openSettings();
  await userEvent.click(screen.getByRole("button", { name: "检查更新…" }));
  return screen.getByRole("dialog", { name: "检查更新" });
}

async function openFound() {
  overrides.check_for_update = () => found;
  const consent = await openConsent();
  await userEvent.click(within(consent).getByRole("button", { name: "联网检查" }));
  return screen.findByRole("dialog", { name: "发现新版本" });
}

/** Presses 更新并重启 with an install that waits; returns its progress channel and how to end it. */
async function startInstall() {
  let channel!: InstanceType<typeof FakeChannel<UpdateProgress>>;
  let finish!: { resolve: () => void; reject: (code: string) => void };
  overrides.install_update = (args) => {
    channel = args?.onProgress as typeof channel;
    return new Promise<void>((resolve, reject) => (finish = { resolve, reject }));
  };
  const dialog = await openFound();
  await userEvent.click(within(dialog).getByRole("button", { name: "更新并重启" }));
  const send = (progress: UpdateProgress) => act(() => channel.onmessage(progress));
  return { dialog: screen.getByRole("dialog", { name: "正在更新到 V0.4.7" }), send, finish };
}

// The product rule (2026-11-26): GST never goes online on its own; only 联网检查 in the consent dialog does.
describe("检查更新 consent", () => {
  it("never checks at startup, on the settings page or when 检查更新… opens the consent dialog", async () => {
    await openSettings();
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    expect(calls("check_for_update")).toHaveLength(0);

    const key = screen.getByRole("button", { name: "检查更新…" });
    expect(key.previousElementSibling).toHaveTextContent("更新日志");
    await userEvent.click(key);

    const dialog = screen.getByRole("dialog", { name: "检查更新" });
    expect(dialog).toHaveAccessibleDescription("检查更新需要联网。GST 只会向 GitHub 查询最新的版本号，不会发送任何使用记录。");
    expect(buttonTexts(dialog)).toEqual(["取消", "联网检查"]);
    expect(within(dialog).getByRole("button", { name: "联网检查" })).toHaveClass("button-primary");
    expect(within(dialog).getByRole("button", { name: "取消" })).toHaveFocus();
    expect(calls("check_for_update")).toHaveLength(0);
  });

  it("sends nothing when cancelled, with 取消 or Esc, and asks again next time", async () => {
    const dialog = await openConsent();
    await userEvent.click(within(dialog).getByRole("button", { name: "取消" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    await waitFor(() => expect(screen.getByRole("button", { name: "检查更新…" })).toHaveFocus());

    await userEvent.click(screen.getByRole("button", { name: "检查更新…" }));
    expect(screen.getByRole("dialog", { name: "检查更新" })).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();

    expect(calls("check_for_update")).toHaveLength(0);
    expect(mockInvoke.mock.calls.map(([name]) => name)).not.toContain("install_update");
  });

  it("marks 联网检查 busy while GitHub answers, then says it is the latest version", async () => {
    let answer!: (value: unknown) => void;
    overrides.check_for_update = () => new Promise((resolve) => (answer = resolve));
    const dialog = await openConsent();
    const check = within(dialog).getByRole("button", { name: "联网检查" });

    await userEvent.click(check);
    expect(check).toHaveAttribute("aria-busy", "true");
    expect(check).toHaveAttribute("aria-disabled", "true");
    expect(check).toBeEnabled();
    await userEvent.click(check);
    expect(calls("check_for_update")).toHaveLength(1);

    await act(async () => answer(null));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(await screen.findByText("已是最新版本")).toBeInTheDocument();
  });

  it("says GitHub cannot be reached when the check fails", async () => {
    overrides.check_for_update = () => Promise.reject("update_check_failed");
    const dialog = await openConsent();
    await userEvent.click(within(dialog).getByRole("button", { name: "联网检查" }));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("无法连接到 GitHub"));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("ignores a check answered after the dialog was cancelled", async () => {
    let answer!: (value: unknown) => void;
    overrides.check_for_update = () => new Promise((resolve) => (answer = resolve));
    const dialog = await openConsent();
    await userEvent.click(within(dialog).getByRole("button", { name: "联网检查" }));
    await userEvent.keyboard("{Escape}");

    await act(async () => answer(found));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByText("已是最新版本")).toBeNull();
  });
});

describe("发现新版本", () => {
  it("shows the versions and the installer size, with the release notes on the left", async () => {
    const dialog = await openFound();
    const facts = Array.from(dialog.querySelectorAll(".import-fact")).map((fact) => [
      fact.querySelector("dt")?.textContent,
      fact.querySelector("dd")?.textContent,
    ]);
    expect(facts).toEqual([
      ["当前版本", "V0.4.6"],
      ["新版本", "V0.4.7"],
      ["安装包", "6.3 MB"],
    ]);
    expect(dialog).toHaveAccessibleDescription("更新会从 GitHub 下载安装包，装好后 GST 自动重启。更新前会先备份当前数据。");
    expect(buttonTexts(dialog)).toEqual(["更新日志", "稍后", "更新并重启"]);
    expect(within(dialog).getByRole("button", { name: "更新并重启" })).toHaveClass("button-primary");
    expect(within(dialog).getByRole("button", { name: "稍后" })).toHaveFocus();

    await userEvent.click(within(dialog).getByRole("button", { name: "更新日志（在浏览器中打开）" }));
    expect(calls("open_feedback_link").map(([, args]) => args)).toEqual([{ link: "releases" }]);

    await userEvent.click(within(dialog).getByRole("button", { name: "稍后" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(calls("install_update")).toHaveLength(0);
  });

  it("leaves the size row out when the manifest lists no size", async () => {
    overrides.check_for_update = () => ({ ...found, size_bytes: null });
    const consent = await openConsent();
    await userEvent.click(within(consent).getByRole("button", { name: "联网检查" }));
    const dialog = await screen.findByRole("dialog", { name: "发现新版本" });
    expect(Array.from(dialog.querySelectorAll(".import-fact dt")).map((dt) => dt.textContent)).toEqual([
      "当前版本",
      "新版本",
    ]);
  });
});

describe("正在更新", () => {
  it("draws the download progress from the channel's messages", async () => {
    const { dialog, send } = await startInstall();
    expect(calls("install_update")).toHaveLength(1);
    expect(buttonTexts(dialog)).toEqual(["取消", "更新并重启"]);
    expect(within(dialog).getByRole("button", { name: "更新并重启" })).toBeDisabled();
    const cancel = within(dialog).getByRole("button", { name: "取消" });
    expect(cancel).toBeEnabled();
    expect(cancel).toHaveFocus();
    const bar = within(dialog).getByRole("progressbar");
    expect(dialog).toHaveTextContent("正在下载");
    expect(dialog).toHaveTextContent("0.0 / 6.3 MB");
    expect(bar).toHaveAttribute("aria-valuenow", "0");

    send({ downloaded: Math.round(2.6 * MB), total: Math.round(6.3 * MB) });
    expect(dialog).toHaveTextContent("2.6 / 6.3 MB");
    expect(bar).toHaveAttribute("aria-valuenow", "41");
    expect((bar.firstElementChild as HTMLElement).style.width).toBe("41%");
  });

  it("cancels the download with 取消: nothing is installed and nothing is said", async () => {
    const { dialog, send, finish } = await startInstall();
    send({ downloaded: MB, total: 6 * MB });
    await userEvent.click(within(dialog).getByRole("button", { name: "取消" }));

    expect(calls("cancel_update")).toHaveLength(1);
    expect(screen.queryByRole("dialog")).toBeNull();
    await act(async () => finish.reject("update_cancelled"));
    expect(screen.queryByText("更新没有完成")).toBeNull();
  });

  it("cancels with Esc while downloading", async () => {
    await startInstall();
    await userEvent.keyboard("{Escape}");
    expect(calls("cancel_update")).toHaveLength(1);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("keeps the dialog once the installer is in: 取消 is off and Esc does nothing", async () => {
    const { dialog, send } = await startInstall();
    send({ downloaded: 6 * MB, total: 6 * MB });
    expect(within(dialog).getByRole("button", { name: "取消" })).toBeDisabled();
    expect(dialog).toHaveFocus();
    await userEvent.keyboard("{Escape}");
    expect(screen.getByRole("dialog", { name: "正在更新到 V0.4.7" })).toBeInTheDocument();
    expect(calls("cancel_update")).toHaveLength(0);
  });

  it.each(["update_backup_failed", "update_download_failed", "update_install_failed"])(
    "says the update did not finish on %s and closes the dialog",
    async (code) => {
      const { finish } = await startInstall();
      await act(async () => finish.reject(code));

      await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("更新没有完成"));
      expect(screen.queryByRole("dialog")).toBeNull();
    },
  );
});

describe("update progress formatting", () => {
  it("shows MB with one decimal and falls back to the manifest size", () => {
    expect(formatDownloadProgress({ downloaded: 2.6 * MB, total: 6.3 * MB }, null)).toBe("2.6 / 6.3 MB");
    expect(formatDownloadProgress(null, 6.3 * MB)).toBe("0.0 / 6.3 MB");
    expect(formatDownloadProgress({ downloaded: 2.6 * MB, total: null }, 6.3 * MB)).toBe("2.6 / 6.3 MB");
    expect(formatDownloadProgress({ downloaded: 2.6 * MB, total: null }, null)).toBe("2.6 MB");
    expect(formatDownloadProgress({ downloaded: 7 * MB, total: 6.3 * MB }, null)).toBe("6.3 / 6.3 MB");
  });

  it("treats the download as finished only when the whole known size is in", () => {
    expect(downloadFinished(null)).toBe(false);
    expect(downloadFinished({ downloaded: 5, total: 6 })).toBe(false);
    expect(downloadFinished({ downloaded: 6, total: 6 })).toBe(true);
    expect(downloadFinished({ downloaded: 6, total: null })).toBe(false);
  });
});
