import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockInvoke = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/core", () => ({ invoke: mockInvoke }));
vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({ onCloseRequested: () => Promise.resolve(() => {}) }),
}));
vi.mock("@tauri-apps/plugin-autostart", () => ({
  disable: vi.fn(async () => {}),
  enable: vi.fn(async () => {}),
  isEnabled: vi.fn(async () => true),
}));

import App from "../App";
import { importFacts } from "../components/SettingsImportDialog";

const TODAY = "2026-11-24";
const SAVED = "C:\\Users\\demo\\Downloads\\GST-日报-2026-11-24.csv";
type Handler = (args: Record<string, unknown> | undefined) => unknown;

let settings: Record<string, unknown>;
let overrides: Record<string, Handler>;

function dashboard(date: string) {
  return {
    last_scan_succeeded: true,
    product_title: "全局软件计时器",
    locale: "zh-CN",
    usage_date: date,
    is_today: date === TODAY,
    most_used: null,
    recorded_today_seconds: 0,
    active_today_seconds: 0,
    apps: [
      {
        app_id: 1,
        display_name: "Visual Studio Code",
        process_name: "Code.exe",
        icon_url: null,
        total_seconds: 36000,
        today_seconds: 19440,
        active_today_seconds: 8640,
        status: date === TODAY ? "foreground" : "closed",
        is_running: date === TODAY,
      },
    ],
  };
}

const defaults: Record<string, Handler> = {
  get_app_settings: () => settings,
  get_calendar_summary: () => ({ today: TODAY, data_start_date: "2026-09-03" }),
  get_transparency_effects_enabled: () => true,
  get_dashboard_summary: (args) => dashboard(typeof args?.date === "string" ? args.date : TODAY),
  get_background_page_summary: (args) => ({
    logical_cores: 8,
    running_count: 0,
    rows: [],
    usage_date: typeof args?.date === "string" ? args.date : TODAY,
    is_today: args?.date === undefined,
  }),
  get_software_page_summary: () => ({ focused: [], hidden: [], discovered: [] }),
  get_statistics_summary: (args) => ({
    start: args?.start,
    end: args?.end,
    days_count: 7,
    previous_start: "2026-11-11",
    previous_end: "2026-11-17",
    data_start_date: "2026-09-03",
    software_detail_start_date: "2026-09-03",
    days_without_software_detail: 0,
    system_comparison_available: true,
    software_comparison_available: true,
    previous_recorded_seconds: 0,
    previous_active_seconds: 0,
    days: [],
    ranking: [],
    idle_open: [],
    sessions: [],
  }),
  save_text_export: (args) => `C:\\Users\\demo\\Downloads\\${String(args?.suggestedName)}`,
  reveal_saved_file: () => undefined,
  export_settings_file: () => "C:\\Users\\demo\\Downloads\\GST-设置-2026-11-24.json",
  backup_all_data: () => "C:\\Users\\demo\\Downloads\\GST-数据备份-2026-11-24.db",
  pick_settings_import: () => ({
    import_id: "import-1",
    changes: [{ key: "theme", from: "system", to: "dark" }],
    focused_added: 2,
    hidden_added: 1,
    unmatched: 3,
    conflicts: 0,
  }),
  apply_settings_import: () => {
    settings = { ...settings, theme: "dark", theme_configured: true };
    return { focused_added: 2, hidden_added: 1, unmatched: 3, conflicts: 0 };
  },
};

beforeEach(() => {
  // Only Date is faked, so polling and the toast keep real timers.
  vi.useFakeTimers({ now: new Date(2026, 10, 24, 22, 1), toFake: ["Date"] });
  settings = {
    close_behavior: "minimize_to_tray",
    close_behavior_configured: true,
    autostart_enabled: true,
    autostart_configured: true,
    duration_format: "decimal_hours",
    duration_format_configured: true,
    theme: "system",
    theme_configured: false,
  };
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
});

const calls = (command: string) => mockInvoke.mock.calls.filter(([name]) => name === command);

async function openPage(name: string) {
  await userEvent.click(await screen.findByRole("button", { name }));
}

async function pickFromMenu(item: string) {
  await userEvent.click(await screen.findByRole("button", { name: "迁移与备份" }));
  await userEvent.click(within(screen.getByRole("menu", { name: "迁移与备份" })).getByRole("menuitem", { name: new RegExp(item) }));
}

describe("page CSV exports", () => {
  it("saves 概览's 日报 straight from the key and offers to show the file", async () => {
    render(<App />);

    await userEvent.click(await screen.findByRole("button", { name: "导出日报 CSV" }));

    await waitFor(() => expect(calls("save_text_export")).toHaveLength(1));
    const [, args] = calls("save_text_export")[0];
    expect(args).toMatchObject({ suggestedName: "GST-日报-2026-11-24.csv", filterName: "CSV", extension: "csv" });
    expect(args.contents).toBe(
      "日期,软件名称,进程名,当日运行(小时),当日活跃(小时),累计运行(小时)\r\n2026-11-24,Visual Studio Code,Code.exe,5.40,2.40,10.00\r\n",
    );
    expect(await screen.findByRole("status")).toHaveTextContent("已保存");

    await userEvent.click(screen.getByRole("button", { name: "在文件夹中显示" }));
    expect(mockInvoke).toHaveBeenCalledWith("reveal_saved_file", { path: SAVED });
  });

  it("exports the viewed past day on 概览", async () => {
    render(<App />);

    await userEvent.click(await screen.findByRole("button", { name: "前一天" }));
    await userEvent.click(screen.getByRole("button", { name: "导出日报 CSV" }));

    await waitFor(() => expect(calls("save_text_export")).toHaveLength(1));
    expect(mockInvoke).toHaveBeenCalledWith("get_dashboard_summary", { date: "2026-11-23" });
    expect(calls("save_text_export")[0][1]).toMatchObject({ suggestedName: "GST-日报-2026-11-23.csv" });
  });

  it("exports the viewed day's 后台 records", async () => {
    render(<App />);
    await openPage("后台");

    await userEvent.click(await screen.findByRole("button", { name: "前一天" }));
    await userEvent.click(screen.getByRole("button", { name: "导出后台记录 CSV" }));

    await waitFor(() => expect(calls("save_text_export")).toHaveLength(1));
    expect(mockInvoke).toHaveBeenCalledWith("get_background_page_summary", { date: "2026-11-23" });
    expect(calls("save_text_export")[0][1]).toMatchObject({ suggestedName: "GST-后台-2026-11-23.csv" });
  });

  it("exports the 软件清单 dated today", async () => {
    render(<App />);
    await openPage("软件");

    await userEvent.click(await screen.findByRole("button", { name: "导出软件清单 CSV" }));

    await waitFor(() => expect(calls("save_text_export")).toHaveLength(1));
    expect(calls("save_text_export")[0][1]).toMatchObject({ suggestedName: "GST-软件清单-2026-11-24.csv" });
  });

  it("exports the 统计 range the page shows, with its hidden switch", async () => {
    render(<App />);
    await openPage("统计");

    await userEvent.click(await screen.findByRole("switch", { name: "包含隐藏软件" }));
    await userEvent.click(screen.getByRole("button", { name: "导出报表 CSV" }));

    await waitFor(() => expect(calls("save_text_export")).toHaveLength(1));
    const statisticsCalls = calls("get_statistics_summary");
    expect(statisticsCalls[statisticsCalls.length - 1][1]).toEqual({ start: "2026-11-18", end: "2026-11-24", includeHidden: true });
    expect(calls("save_text_export")[0][1]).toMatchObject({ suggestedName: "GST-统计-2026-11-18至2026-11-24.csv" });
  });

  it("does nothing visible when the save dialog is cancelled", async () => {
    overrides.save_text_export = () => null;
    render(<App />);

    await userEvent.click(await screen.findByRole("button", { name: "导出日报 CSV" }));

    await waitFor(() => expect(calls("save_text_export")).toHaveLength(1));
    await waitFor(() => expect(screen.getByRole("button", { name: "导出日报 CSV" })).not.toHaveAttribute("aria-busy"));
    expect(screen.getByRole("status")).toHaveTextContent("");
    expect(screen.getByRole("alert")).toHaveTextContent("");
  });

  it("shows 保存失败 when the save fails", async () => {
    overrides.save_text_export = () => {
      throw "export_invalid_request";
    };
    render(<App />);

    await userEvent.click(await screen.findByRole("button", { name: "导出日报 CSV" }));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("保存失败"));
    expect(screen.queryByRole("button", { name: "在文件夹中显示" })).not.toBeInTheDocument();
  });

  it("ignores a second press while the save dialog is open", async () => {
    let finish: (path: string | null) => void = () => {};
    overrides.save_text_export = () => new Promise((resolve) => (finish = resolve));
    render(<App />);

    const key = await screen.findByRole("button", { name: "导出日报 CSV" });
    await userEvent.click(key);
    await waitFor(() => expect(key).toHaveAttribute("aria-busy", "true"));
    await userEvent.click(key);
    finish(null);

    await waitFor(() => expect(key).not.toHaveAttribute("aria-busy"));
    expect(calls("save_text_export")).toHaveLength(1);
  });
});

describe("迁移与备份", () => {
  it("exports the settings file and backs up the data", async () => {
    render(<App />);
    await openPage("设置");

    await pickFromMenu("导出设置");
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("已保存"));
    expect(calls("export_settings_file")).toHaveLength(1);

    await pickFromMenu("备份全部数据");
    await waitFor(() => expect(calls("backup_all_data")).toHaveLength(1));
    await userEvent.click(await screen.findByRole("button", { name: "在文件夹中显示" }));
    expect(mockInvoke).toHaveBeenCalledWith("reveal_saved_file", {
      path: "C:\\Users\\demo\\Downloads\\GST-数据备份-2026-11-24.db",
    });
  });

  it("says so when the saved file cannot be shown in its folder", async () => {
    overrides.reveal_saved_file = () => {
      throw "export_unknown_path";
    };
    render(<App />);
    await openPage("设置");

    await pickFromMenu("导出设置");
    await userEvent.click(await screen.findByRole("button", { name: "在文件夹中显示" }));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("无法打开文件夹"));
  });

  it("shows 保存失败 when the backup fails", async () => {
    overrides.backup_all_data = () => {
      throw "export_target_is_database";
    };
    render(<App />);
    await openPage("设置");

    await pickFromMenu("备份全部数据");

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("保存失败"));
  });

  it("previews a settings import as rows and applies it on 导入", async () => {
    render(<App />);
    await openPage("设置");
    await waitFor(() => expect(calls("get_app_settings")).toHaveLength(1));

    await pickFromMenu("导入设置");

    const dialog = await screen.findByRole("dialog", { name: "导入设置" });
    const rows = within(dialog).getAllByRole("term").map((term) => [term.textContent, term.nextElementSibling?.textContent]);
    expect(rows).toEqual([
      ["主题", "跟随系统→改为深色"],
      ["特别关注", "+2"],
      ["隐藏软件", "+1"],
      ["本机没有的软件", "3"],
      ["已在另一列表", "0"],
    ]);
    expect(within(dialog).getByRole("button", { name: "取消" })).toHaveFocus();

    await userEvent.click(within(dialog).getByRole("button", { name: "导入" }));

    await waitFor(() => expect(screen.queryByRole("dialog", { name: "导入设置" })).not.toBeInTheDocument());
    expect(mockInvoke).toHaveBeenCalledWith("apply_settings_import", { importId: "import-1" });
    expect(screen.getByRole("status")).toHaveTextContent("已导入");
    await waitFor(() => expect(calls("get_app_settings")).toHaveLength(2));
    await waitFor(() => expect(screen.getByRole("radio", { name: "深色" })).toHaveAttribute("aria-checked", "true"));
    await waitFor(() => expect(screen.getByRole("button", { name: "迁移与备份" })).toHaveFocus());
  });

  it("closes the import preview on 取消 or Esc without applying it", async () => {
    render(<App />);
    await openPage("设置");

    await pickFromMenu("导入设置");
    await userEvent.click(await screen.findByRole("button", { name: "取消" }));
    expect(screen.queryByRole("dialog", { name: "导入设置" })).not.toBeInTheDocument();

    await pickFromMenu("导入设置");
    await screen.findByRole("dialog", { name: "导入设置" });
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "导入设置" })).not.toBeInTheDocument();

    expect(calls("apply_settings_import")).toHaveLength(0);
  });

  it("keeps Tab inside the import preview", async () => {
    render(<App />);
    await openPage("设置");
    await pickFromMenu("导入设置");

    const dialog = await screen.findByRole("dialog", { name: "导入设置" });
    await userEvent.tab();
    expect(within(dialog).getByRole("button", { name: "导入" })).toHaveFocus();
    await userEvent.tab();
    expect(within(dialog).getByRole("button", { name: "取消" })).toHaveFocus();
    await userEvent.tab({ shift: true });
    expect(within(dialog).getByRole("button", { name: "导入" })).toHaveFocus();
  });

  it("keeps focus in the import preview after a click on its text", async () => {
    render(<App />);
    await openPage("设置");
    await pickFromMenu("导入设置");

    const dialog = await screen.findByRole("dialog", { name: "导入设置" });
    await userEvent.click(within(dialog).getByText("特别关注"));
    expect(dialog).toHaveFocus();
    await userEvent.tab({ shift: true });
    expect(within(dialog).getByRole("button", { name: "导入" })).toHaveFocus();

    await userEvent.click(within(dialog).getByText("隐藏软件"));
    await userEvent.tab();
    expect(within(dialog).getByRole("button", { name: "取消" })).toHaveFocus();
  });

  it("keeps Tab and Esc working once focus has left the preview, and makes the app behind inert", async () => {
    render(<App />);
    await openPage("设置");
    await pickFromMenu("导入设置");

    const dialog = await screen.findByRole("dialog", { name: "导入设置" });
    const shell = document.querySelector(".app-shell") as HTMLElement;
    expect(shell).toHaveAttribute("inert");
    expect(document.querySelector(".toast")).toHaveAttribute("inert");

    // A press on the scrim keeps focus on the key it was on.
    await userEvent.click(dialog.parentElement as HTMLElement);
    expect(within(dialog).getByRole("button", { name: "取消" })).toHaveFocus();

    // Focus that reaches the page behind anyway is pulled back in.
    act(() => {
      screen.getByRole("button", { name: "概览" }).focus();
    });
    expect(within(dialog).getByRole("button", { name: "取消" })).toHaveFocus();

    // With focus on nothing, Tab steps into the dialog and Esc still closes it.
    act(() => {
      (document.activeElement as HTMLElement).blur();
    });
    expect(document.body).toHaveFocus();
    await userEvent.tab();
    expect(within(dialog).getByRole("button", { name: "取消" })).toHaveFocus();
    act(() => {
      (document.activeElement as HTMLElement).blur();
    });
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "导入设置" })).not.toBeInTheDocument();
    expect(shell).not.toHaveAttribute("inert");
    expect(screen.getByRole("button", { name: "迁移与备份" })).toHaveFocus();
  });

  it("does nothing when the import file dialog is cancelled", async () => {
    overrides.pick_settings_import = () => null;
    render(<App />);
    await openPage("设置");

    await pickFromMenu("导入设置");

    await waitFor(() => expect(calls("pick_settings_import")).toHaveLength(1));
    expect(screen.queryByRole("dialog", { name: "导入设置" })).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("");
  });

  it.each([
    ["settings_import_invalid", "不是有效的设置文件"],
    ["settings_import_too_large", "设置文件过大"],
  ])("reports %s when the picked file is refused", async (code, message) => {
    overrides.pick_settings_import = () => {
      throw code;
    };
    render(<App />);
    await openPage("设置");

    await pickFromMenu("导入设置");

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(message));
    expect(screen.queryByRole("dialog", { name: "导入设置" })).not.toBeInTheDocument();
  });

  it("holds focus in the import preview while 导入 runs", async () => {
    let finish = () => {};
    overrides.apply_settings_import = () =>
      new Promise((resolve) => {
        finish = () => resolve({ focused_added: 0, hidden_added: 0, unmatched: 0, conflicts: 0 });
      });
    render(<App />);
    await openPage("设置");
    await pickFromMenu("导入设置");

    const dialog = await screen.findByRole("dialog", { name: "导入设置" });
    await userEvent.click(within(dialog).getByRole("button", { name: "导入" }));

    await waitFor(() => expect(dialog).toHaveFocus());
    await userEvent.keyboard("{Escape}");
    await userEvent.tab();
    expect(dialog).toHaveFocus();

    finish();
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "导入设置" })).not.toBeInTheDocument());
  });

  it("applies the import only after a theme save still under way has finished", async () => {
    let finishThemeSave = () => {};
    overrides.set_theme_preference = () =>
      new Promise<void>((resolve) => {
        finishThemeSave = resolve;
      });
    render(<App />);
    await openPage("设置");
    await waitFor(() => expect(calls("get_app_settings")).toHaveLength(1));

    await userEvent.click(await screen.findByRole("radio", { name: "浅色" }));
    await pickFromMenu("导入设置");
    await userEvent.click(await screen.findByRole("button", { name: "导入" }));

    expect(calls("apply_settings_import")).toHaveLength(0);
    finishThemeSave();
    await waitFor(() => expect(calls("apply_settings_import")).toHaveLength(1));
    await waitFor(() => expect(screen.getByRole("radio", { name: "深色" })).toHaveAttribute("aria-checked", "true"));
  });

  it("shows 导入失败 and closes the preview when applying fails", async () => {
    overrides.apply_settings_import = () => {
      throw "settings_import_expired";
    };
    render(<App />);
    await openPage("设置");

    await pickFromMenu("导入设置");
    await userEvent.click(await screen.findByRole("button", { name: "导入" }));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("导入失败"));
    expect(screen.queryByRole("dialog", { name: "导入设置" })).not.toBeInTheDocument();
    expect(calls("get_app_settings")).toHaveLength(1);
  });
});

describe("importFacts", () => {
  it("names every setting and its values in the words of the 设置 page", () => {
    expect(
      importFacts({
        import_id: "x",
        changes: [
          { key: "duration_format", from: "decimal_hours", to: "hours_minutes" },
          { key: "close_behavior", from: "minimize_to_tray", to: "exit" },
        ],
        focused_added: 0,
        hidden_added: 0,
        unmatched: 0,
        conflicts: 1,
      }),
    ).toEqual([
      { label: "显示分钟数", value: "已关闭", to: "已开启" },
      { label: "关闭窗口", value: "最小化到后台", to: "直接退出" },
      { label: "特别关注", value: "+0" },
      { label: "隐藏软件", value: "+0" },
      { label: "本机没有的软件", value: "0" },
      { label: "已在另一列表", value: "1" },
    ]);
  });
});
