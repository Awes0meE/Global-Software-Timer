import { afterEach, describe, expect, it, vi } from "vitest";

const mockInvoke = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/core", () => ({ invoke: mockInvoke }));
vi.mock("@tauri-apps/plugin-autostart", () => ({ disable: vi.fn(), enable: vi.fn(), isEnabled: vi.fn() }));

import type {
  AppUsageRow,
  BackgroundPageSummary,
  BackgroundRow,
  DashboardSummary,
  SoftwarePageRow,
  SoftwarePageSummary,
  StatisticsSummary,
} from "../api";
import { BACKGROUND_CSV_COLUMNS, DAILY_REPORT_CSV_COLUMNS, SOFTWARE_LIST_CSV_COLUMNS } from "../csv";
import {
  STATISTICS_CSV_COLUMNS,
  backgroundCsv,
  buildCsvExport,
  dailyReportCsv,
  formatLocalDateTime,
  isCsvExportAction,
  softwareListCsv,
  statisticsCsv,
} from "../exports";

const H = 3600;

afterEach(() => {
  mockInvoke.mockReset();
  vi.useRealTimers();
});

/** CSV text as rows of cells (the fixtures have no quoted commas). */
function parse(csv: string): string[][] {
  expect(csv.endsWith("\r\n")).toBe(true);
  return csv
    .slice(0, -2)
    .split("\r\n")
    .map((line) => line.split(","));
}

function app(overrides: Partial<AppUsageRow>): AppUsageRow {
  return {
    app_id: 1,
    display_name: "Visual Studio Code",
    process_name: "Code.exe",
    icon_url: null,
    total_seconds: 412.6 * H,
    today_seconds: 5.4 * H,
    active_today_seconds: 2.4 * H,
    status: "foreground",
    is_running: true,
    ...overrides,
  };
}

function dashboard(overrides: Partial<DashboardSummary> = {}): DashboardSummary {
  return {
    last_scan_succeeded: true,
    product_title: "全局软件计时器",
    locale: "zh-CN",
    usage_date: "2026-11-24",
    is_today: true,
    most_used: null,
    recorded_today_seconds: 0,
    active_today_seconds: 0,
    apps: [app({}), app({ app_id: 2, display_name: "=cmd|' /C calc'!A0", process_name: "evil.exe", today_seconds: 600, active_today_seconds: 0, total_seconds: 600 })],
    ...overrides,
  };
}

function softwareRow(overrides: Partial<SoftwarePageRow>): SoftwarePageRow {
  return {
    identity_key: "code",
    display_name: "Visual Studio Code",
    process_name: "Code.exe",
    icon_url: null,
    today_runtime_seconds: 5 * H,
    today_focused_seconds: 2 * H,
    total_runtime_seconds: 100 * H,
    total_focused_seconds: 50 * H,
    today_foreground_seconds: 4 * H,
    today_background_seconds: 1 * H,
    total_foreground_seconds: 80 * H,
    total_background_seconds: 20 * H,
    last_opened_at: null,
    status: "foreground",
    mark: "none",
    ...overrides,
  };
}

function backgroundRow(overrides: Partial<BackgroundRow>): BackgroundRow {
  return {
    family_key: "edge",
    display_name: "Microsoft Edge",
    process_name: "msedge.exe",
    icon_url: null,
    is_running: false,
    process_count: 7,
    cpu_percent: null,
    memory_bytes: 512 * 1024 * 1024,
    today_running_seconds: 1.5 * H,
    today_cpu_seconds: 42.25,
    ...overrides,
  };
}

function background(overrides: Partial<BackgroundPageSummary> = {}): BackgroundPageSummary {
  return {
    logical_cores: 8,
    running_count: 0,
    rows: [backgroundRow({})],
    usage_date: "2026-11-17",
    is_today: false,
    ...overrides,
  };
}

function statistics(overrides: Partial<StatisticsSummary> = {}): StatisticsSummary {
  return {
    start: "2026-11-01",
    end: "2026-11-24",
    days_count: 24,
    previous_start: "2026-10-08",
    previous_end: "2026-10-31",
    data_start_date: "2026-09-03",
    software_detail_start_date: "2026-09-03",
    days_without_software_detail: 0,
    system_comparison_available: true,
    software_comparison_available: true,
    previous_recorded_seconds: 0,
    previous_active_seconds: 0,
    days: [],
    ranking: [
      { identity_key: "code", display_name: "Visual Studio Code", icon_url: null, rank: 1, previous_rank: 2, is_new: false, focused_seconds: 30 * H, previous_focused_seconds: 0, window_seconds: 40 * H },
      { identity_key: "chat", display_name: "微信", icon_url: null, rank: 2, previous_rank: null, is_new: true, focused_seconds: 0.25 * H, previous_focused_seconds: 0, window_seconds: 60 * H },
    ],
    idle_open: [
      { identity_key: "chat", display_name: "微信", icon_url: null, window_seconds: 60 * H, focused_seconds: 0.25 * H, idle_seconds: 59.75 * H },
      { identity_key: "music", display_name: "网易云音乐", icon_url: null, window_seconds: 9 * H, focused_seconds: 0, idle_seconds: 9 * H },
    ],
    sessions: [
      { identity_key: "code", display_name: "Visual Studio Code", icon_url: null, launch_count: 12, average_seconds: 2.5 * H, longest_seconds: 6 * H },
      { identity_key: "notes", display_name: "记事本", icon_url: null, launch_count: 3, average_seconds: 90, longest_seconds: 120 },
    ],
    ...overrides,
  };
}

describe("dailyReportCsv", () => {
  it("lists the overview rows for the summary's day with hours to two decimals", () => {
    const rows = parse(dailyReportCsv(dashboard()));

    expect(rows[0]).toEqual([...DAILY_REPORT_CSV_COLUMNS]);
    expect(rows[1]).toEqual(["2026-11-24", "Visual Studio Code", "Code.exe", "5.40", "2.40", "412.60"]);
  });

  it("guards a software name that a spreadsheet would run as a formula", () => {
    const csv = dailyReportCsv(dashboard());
    expect(csv).toContain("\r\n2026-11-24,'=cmd|' /C calc'!A0,evil.exe,0.17,0.00,0.17\r\n");
  });

  it("dates a past day's rows with that day and does not start with a BOM", () => {
    const csv = dailyReportCsv(dashboard({ usage_date: "2026-11-17", is_today: false, apps: [app({ status: "closed" })] }));
    expect(csv.startsWith("﻿")).toBe(false);
    expect(parse(csv)[1][0]).toBe("2026-11-17");
  });

  it("writes only the header for a day without software", () => {
    expect(dailyReportCsv(dashboard({ apps: [] }))).toBe(`${DAILY_REPORT_CSV_COLUMNS.join(",")}\r\n`);
  });
});

describe("softwareListCsv", () => {
  it("lists every identity once, in the 特别关注, 隐藏, 已发现 order", () => {
    const focused = softwareRow({ identity_key: "code", mark: "focused", last_opened_at: "2026-11-24T09:05:00" });
    const hidden = softwareRow({ identity_key: "edge", display_name: "Edge", process_name: "msedge.exe", mark: "hidden", status: "tray" });
    const other = softwareRow({ identity_key: "notes", display_name: "记事本", process_name: "notepad.exe", status: "closed" });
    const summary: SoftwarePageSummary = { focused: [focused], hidden: [hidden], discovered: [other, focused, hidden] };

    const rows = parse(softwareListCsv(summary));

    expect(rows[0]).toEqual([...SOFTWARE_LIST_CSV_COLUMNS]);
    expect(rows.slice(1).map((row) => [row[0], row[2], row[3]])).toEqual([
      ["Visual Studio Code", "特别关注", "前台运行"],
      ["Edge", "隐藏", "托盘运行"],
      ["记事本", "已发现", "未运行"],
    ]);
    expect(rows[1]).toEqual([
      "Visual Studio Code", "Code.exe", "特别关注", "前台运行", "2026-11-24 09:05",
      "4.00", "1.00", "2.00", "80.00", "20.00", "50.00",
    ]);
    expect(rows[2][4]).toBe("");
  });

  it("falls back to the runtime like the 软件 page when the split is missing", () => {
    const row = softwareRow({
      today_foreground_seconds: undefined,
      today_background_seconds: undefined,
      total_foreground_seconds: undefined,
      total_background_seconds: undefined,
    });
    const rows = parse(softwareListCsv({ focused: [], hidden: [], discovered: [row] }));
    expect(rows[1].slice(5)).toEqual(["5.00", "0.00", "2.00", "100.00", "0.00", "50.00"]);
  });
});

describe("backgroundCsv", () => {
  it("writes the day's peaks, background hours and CPU seconds, never current CPU or status", () => {
    const rows = parse(backgroundCsv(background()));

    expect(rows[0]).toEqual([...BACKGROUND_CSV_COLUMNS]);
    expect(rows[1]).toEqual(["2026-11-17", "Microsoft Edge", "msedge.exe", "7", "512.0", "1.50", "42.3"]);
  });

  it("keeps the same columns for today", () => {
    const today = background({
      usage_date: "2026-11-24",
      is_today: true,
      rows: [backgroundRow({ is_running: true, cpu_percent: 3.5, process_count: 2, memory_bytes: 1536 * 1024 })],
    });
    const rows = parse(backgroundCsv(today));
    expect(rows[1]).toEqual(["2026-11-24", "Microsoft Edge", "msedge.exe", "2", "1.5", "1.50", "42.3"]);
  });
});

describe("statisticsCsv", () => {
  it("lists ranked software first, then the 开着没用 and 会话 ledgers' others, leaving unknown figures empty", () => {
    const names = new Map([
      ["code", "Code.exe"],
      ["chat", "Weixin.exe"],
    ]);
    const rows = parse(statisticsCsv(statistics(), names));

    expect(rows[0]).toEqual([...STATISTICS_CSV_COLUMNS]);
    expect(rows.slice(1)).toEqual([
      ["Visual Studio Code", "Code.exe", "1", "30.00", "40.00", "", "12", "2.50", "6.00"],
      ["微信", "Weixin.exe", "2", "0.25", "60.00", "59.75", "", "", ""],
      ["网易云音乐", "", "", "0.00", "9.00", "9.00", "", "", ""],
      ["记事本", "", "", "", "", "", "3", "0.03", "0.03"],
    ]);
  });

  it("writes only the header for a range without software", () => {
    const csv = statisticsCsv(statistics({ ranking: [], idle_open: [], sessions: [] }));
    expect(csv).toBe(`${STATISTICS_CSV_COLUMNS.join(",")}\r\n`);
  });
});

describe("formatLocalDateTime", () => {
  it("prints a local date and minute, and nothing for never or a bad value", () => {
    expect(formatLocalDateTime("2026-11-24T21:07:59")).toBe("2026-11-24 21:07");
    expect(formatLocalDateTime(null)).toBe("");
    expect(formatLocalDateTime("not a date")).toBe("");
  });
});

describe("buildCsvExport", () => {
  const context = { viewedDate: "2026-11-24", today: "2026-11-24", statistics: null };

  it("only treats the four page CSVs as CSV exports", () => {
    expect(["overview-csv", "software-csv", "background-csv", "statistics-csv"].every((id) => isCsvExportAction(id as never))).toBe(true);
    expect(isCsvExportAction("settings-export")).toBe(false);
    expect(isCsvExportAction("data-backup")).toBe(false);
  });

  it("reads today's overview through the live path and names the file after that day", async () => {
    mockInvoke.mockResolvedValue(dashboard());

    const file = await buildCsvExport("overview-csv", context);

    expect(mockInvoke).toHaveBeenCalledWith("get_dashboard_summary");
    expect(file).toMatchObject({ suggestedName: "GST-日报-2026-11-24.csv", filterName: "CSV", extension: "csv" });
    expect(file.contents).toBe(dailyReportCsv(dashboard()));
  });

  it("reads a past day's overview and background by date", async () => {
    const pastContext = { ...context, viewedDate: "2026-11-17" };
    mockInvoke.mockImplementation(async (command: string) =>
      command === "get_dashboard_summary" ? dashboard({ usage_date: "2026-11-17", is_today: false }) : background(),
    );

    const report = await buildCsvExport("overview-csv", pastContext);
    const records = await buildCsvExport("background-csv", pastContext);

    expect(mockInvoke).toHaveBeenCalledWith("get_dashboard_summary", { date: "2026-11-17" });
    expect(mockInvoke).toHaveBeenCalledWith("get_background_page_summary", { date: "2026-11-17" });
    expect(report.suggestedName).toBe("GST-日报-2026-11-17.csv");
    expect(records.suggestedName).toBe("GST-后台-2026-11-17.csv");
    expect(records.contents.split("\r\n")[1].startsWith("2026-11-17,")).toBe(true);
  });

  it("dates the software list today", async () => {
    mockInvoke.mockResolvedValue({ focused: [], hidden: [], discovered: [softwareRow({})] });

    const file = await buildCsvExport("software-csv", { ...context, viewedDate: "2026-11-17" });

    expect(mockInvoke).toHaveBeenCalledWith("get_software_page_summary");
    expect(file.suggestedName).toBe("GST-软件清单-2026-11-24.csv");
  });

  it("reads the 统计 page's range with its hidden switch and adds process names", async () => {
    mockInvoke.mockImplementation(async (command: string) =>
      command === "get_statistics_summary"
        ? statistics()
        : { focused: [softwareRow({ identity_key: "code" })], hidden: [], discovered: [] },
    );

    const file = await buildCsvExport("statistics-csv", {
      ...context,
      statistics: { start: "2026-11-01", end: "2026-11-24", includeHidden: true },
    });

    expect(mockInvoke).toHaveBeenCalledWith("get_statistics_summary", { start: "2026-11-01", end: "2026-11-24", includeHidden: true });
    expect(file.suggestedName).toBe("GST-统计-2026-11-01至2026-11-24.csv");
    expect(file.contents.split("\r\n")[1]).toBe("Visual Studio Code,Code.exe,1,30.00,40.00,,12,2.50,6.00");
  });

  it("uses the page's default 近 7 天 range before the page reports one, and still saves without process names", async () => {
    vi.useFakeTimers({ now: new Date(2026, 10, 24, 12, 0), toFake: ["Date"] });
    mockInvoke.mockImplementation(async (command: string) => {
      if (command === "get_statistics_summary") return statistics({ start: "2026-11-18", end: "2026-11-24" });
      throw new Error("software list unavailable");
    });

    const file = await buildCsvExport("statistics-csv", context);

    expect(mockInvoke).toHaveBeenCalledWith("get_statistics_summary", { start: "2026-11-18", end: "2026-11-24", includeHidden: false });
    expect(file.suggestedName).toBe("GST-统计-2026-11-18至2026-11-24.csv");
    expect(file.contents.split("\r\n")[1]).toBe("Visual Studio Code,,1,30.00,40.00,,12,2.50,6.00");
  });
});
