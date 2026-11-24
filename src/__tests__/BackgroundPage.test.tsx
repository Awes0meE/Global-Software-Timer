import { act, cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DAY_INVALID_DATE } from "../api";
import type { BackgroundPageSummary } from "../api";
import { allCss, parseRules } from "./support/css";
import {
  BackgroundPage,
  backgroundReadings,
  formatBytes,
  formatCpuSeconds,
  formatPercent,
  nextBackgroundSort,
  pastBackgroundReadings,
  sortBackgroundRows,
  splitReading,
} from "../components/BackgroundPage";

const invoke = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/api/core", () => ({ invoke }));

afterEach(() => {
  vi.useRealTimers();
  cleanup();
  invoke.mockReset();
});

const summary: BackgroundPageSummary = {
  logical_cores: 8,
  running_count: 1,
  usage_date: "2026-11-24",
  is_today: true,
  rows: [
    {
      family_key: "razer",
      display_name: "RazerCentralService",
      process_name: "razercentralservice.exe",
      icon_url: null,
      is_running: true,
      process_count: 2,
      cpu_percent: 3.25,
      memory_bytes: 64 * 1024 * 1024,
      peak_process_count: 2,
      peak_memory_bytes: 64 * 1024 * 1024,
      today_running_seconds: 7200,
      today_cpu_seconds: 150,
    },
    {
      family_key: "updater",
      display_name: "Updater",
      process_name: "updater.exe",
      icon_url: null,
      is_running: false,
      process_count: 1,
      cpu_percent: null,
      memory_bytes: 2 * 1024 * 1024 * 1024,
      peak_process_count: 1,
      peak_memory_bytes: 2 * 1024 * 1024 * 1024,
      today_running_seconds: 60,
      today_cpu_seconds: 0.4,
    },
  ],
};

/** A past day: stored peaks and totals only, nothing running, no current CPU. */
const pastSummary: BackgroundPageSummary = {
  ...summary,
  running_count: 0,
  usage_date: "2026-11-17",
  is_today: false,
  rows: summary.rows.map((row, index) => ({
    ...row,
    is_running: false,
    cpu_percent: null,
    process_count: index === 0 ? 2 : 3,
  })),
};

describe("BackgroundPage", () => {
  it("lists background software with live and daily usage", async () => {
    invoke.mockResolvedValue(summary);
    await act(async () => {
      render(<BackgroundPage />);
    });

    const list = screen.getByRole("region", { name: "后台进程列表" });
    const running = within(list).getByText("RazerCentralService").closest(".background-row");
    expect(running).not.toBeNull();
    const cells = within(running as HTMLElement);
    expect(cells.getByText("3.3%")).toBeInTheDocument();
    expect(cells.getByText("64 MB")).toBeInTheDocument();
    expect(cells.getByText("2.0小时")).toBeInTheDocument();
    expect(cells.getByText("2分钟")).toBeInTheDocument();
    expect(cells.queryByText("0.0小时")).not.toBeInTheDocument();
    expect(cells.getByText("运行中")).toBeInTheDocument();

    const exited = within(list).getByText("Updater").closest(".background-row");
    expect(within(exited as HTMLElement).getByText("已退出")).toBeInTheDocument();
    expect(within(exited as HTMLElement).getByText("<1秒")).toBeInTheDocument();
    expect(within(exited as HTMLElement).getByText("2.0 GB")).toBeInTheDocument();

    expect(invoke).toHaveBeenCalledWith("get_background_page_summary");
  });

  it("shows only the error if the initial request fails", async () => {
    invoke.mockRejectedValue(new Error("locked"));
    await act(async () => {
      render(<BackgroundPage />);
    });

    expect(screen.getByText("无法读取后台进程")).toBeInTheDocument();
    expect(screen.queryByText("今天还没有记录到后台进程。")).not.toBeInTheDocument();
  });

  it("waits for the first result and honors duration preferences near an hour", async () => {
    const rows = [{ ...summary.rows[0], today_cpu_seconds: 3599 }];
    invoke.mockResolvedValue({ ...summary, rows });
    const view = render(<BackgroundPage durationFormat="hours_minutes" />);
    expect(screen.getByRole("status")).toHaveTextContent("正在读取");
    expect(screen.queryByText("今天还没有记录到后台进程。")).not.toBeInTheDocument();
    expect(await screen.findByText("59分钟")).toBeInTheDocument();
    view.rerender(<BackgroundPage durationFormat="decimal_hours" />);
    expect(screen.getByText("1.0小时")).toBeInTheDocument();
  });

  it("sorts by a clicked column, high to low first, then low to high", async () => {
    const third = {
      ...summary.rows[0],
      family_key: "agent",
      display_name: "Agent",
      process_name: "agent.exe",
      cpu_percent: 0.5,
      memory_bytes: 512 * 1024 * 1024,
      today_cpu_seconds: 30,
    };
    invoke.mockResolvedValue({ ...summary, rows: [...summary.rows, third] });
    const user = userEvent.setup();
    await act(async () => {
      render(<BackgroundPage />);
    });
    const names = () =>
      screen.getAllByRole("row").slice(1).map((row) => row.querySelector("strong")?.textContent);
    const header = (label: string) => screen.getByRole("columnheader", { name: label });

    // Default: today's CPU time, high to low (the backend order).
    expect(header("今日 CPU 时间")).toHaveAttribute("aria-sort", "descending");
    expect(header("内存")).toHaveAttribute("aria-sort", "none");
    expect(names()).toEqual(["RazerCentralService", "Agent", "Updater"]);

    await user.click(within(header("内存")).getByRole("button"));
    expect(header("内存")).toHaveAttribute("aria-sort", "descending");
    expect(header("今日 CPU 时间")).toHaveAttribute("aria-sort", "none");
    expect(names()).toEqual(["Updater", "Agent", "RazerCentralService"]);
    expect(header("内存").querySelector("[data-sort-icon]")).toHaveAttribute("data-sort-icon", "desc");

    await user.click(within(header("内存")).getByRole("button"));
    expect(header("内存")).toHaveAttribute("aria-sort", "ascending");
    expect(names()).toEqual(["RazerCentralService", "Agent", "Updater"]);
    expect(header("内存").querySelector("[data-sort-icon]")).toHaveAttribute("data-sort-icon", "asc");

    // Rows without a current CPU value ("—") stay last in both directions.
    await user.click(within(header("当前 CPU")).getByRole("button"));
    expect(names()).toEqual(["RazerCentralService", "Agent", "Updater"]);
    await user.click(within(header("当前 CPU")).getByRole("button"));
    expect(names()).toEqual(["Agent", "RazerCentralService", "Updater"]);
  });

  it("sorts names and status like spreadsheet columns", () => {
    const rows = [
      { ...summary.rows[0], display_name: "b", is_running: false },
      { ...summary.rows[0], display_name: "A", is_running: true },
      { ...summary.rows[0], display_name: "c", is_running: false },
    ];
    const pick = (sorted: typeof rows) => sorted.map((row) => row.display_name);
    expect(pick(sortBackgroundRows(rows, { key: "name", direction: "asc" }))).toEqual(["A", "b", "c"]);
    expect(pick(sortBackgroundRows(rows, { key: "name", direction: "desc" }))).toEqual(["c", "b", "A"]);
    expect(pick(sortBackgroundRows(rows, { key: "status", direction: "desc" }))).toEqual(["A", "b", "c"]);
    expect(pick(sortBackgroundRows(rows, { key: "status", direction: "asc" }))).toEqual(["b", "c", "A"]);
    expect(nextBackgroundSort({ key: "name", direction: "desc" }, "memory")).toEqual({
      key: "memory",
      direction: "desc",
    });
    expect(nextBackgroundSort({ key: "memory", direction: "asc" }, "memory")).toEqual({
      key: "memory",
      direction: "desc",
    });
  });

  it("formats CPU time without misleading zeros", () => {
    const cases: Array<[number, string, string]> = [
      // [seconds, decimal_hours, hours_minutes]
      [0, "0秒", "0秒"],
      [0.4, "<1秒", "<1秒"],
      [1, "1秒", "1秒"],
      [59.6, "59秒", "59秒"],
      [60, "1分钟", "1分钟"],
      [359, "5分钟", "5分钟"],
      [360, "0.1小时", "6分钟"],
      [3599, "1.0小时", "59分钟"],
      [3600, "1.0小时", "1小时"],
      [7260, "2.0小时", "2小时1分钟"],
      [Number.NaN, "0秒", "0秒"],
      [Number.POSITIVE_INFINITY, "0秒", "0秒"],
      [-5, "0秒", "0秒"],
    ];
    for (const [seconds, decimal, hoursMinutes] of cases) {
      expect(formatCpuSeconds(seconds, "decimal_hours")).toBe(decimal);
      expect(formatCpuSeconds(seconds, "hours_minutes")).toBe(hoursMinutes);
    }
    expect(formatCpuSeconds(150)).toBe("2分钟");
  });

  it("derives the six strip readings from the summary alone", () => {
    expect(backgroundReadings(summary)).toEqual([
      { label: "正在后台运行", value: "1 个" },
      // Only running rows count towards the live figures.
      { label: "进程", value: "2 个" },
      { label: "当前合计 CPU", value: "3.3%" },
      { label: "当前合计内存", value: "64 MB" },
      // 150s + 0.4s of today's CPU, exited rows included.
      { label: "今日 CPU 时间", value: "2分钟" },
      { label: "今日出现", value: "2 个" },
    ]);
    const longer = { ...summary, rows: [{ ...summary.rows[0], today_cpu_seconds: 7260 }] };
    expect(backgroundReadings(longer, "hours_minutes")[4].value).toBe("2小时1分钟");
    expect(backgroundReadings(longer)[4].value).toBe("2.0小时");
  });

  it("reads zero while nothing runs and nothing was seen", () => {
    const values = (input: BackgroundPageSummary) => backgroundReadings(input).map((reading) => reading.value);
    expect(values({ ...summary, running_count: 0, rows: [] })).toEqual(["0 个", "0 个", "0%", "0 MB", "0秒", "0 个"]);
    // Exited software still counts as seen today and keeps its CPU time, but adds nothing live.
    expect(values({ ...summary, running_count: 0, rows: [summary.rows[1]] })).toEqual([
      "0 个",
      "0 个",
      "0%",
      "0 MB",
      "<1秒",
      "1 个",
    ]);
  });

  it("splits a reading into pixel digits and small units", () => {
    expect(splitReading("64 MB")).toEqual([
      { text: "64", unit: false },
      { text: "MB", unit: true },
    ]);
    expect(splitReading("<0.1%")).toEqual([
      { text: "<0.1", unit: false },
      { text: "%", unit: true },
    ]);
    expect(splitReading("2小时1分钟").map((part) => part.text)).toEqual(["2", "小时", "1", "分钟"]);
    expect(splitReading("<1秒")).toEqual([
      { text: "<1", unit: false },
      { text: "秒", unit: true },
    ]);
  });

  it("prints the summary as one e-ink strip of six readings without small print", async () => {
    invoke.mockResolvedValue(summary);
    await act(async () => {
      render(<BackgroundPage />);
    });

    const overview = screen.getByRole("region", { name: "后台概况" });
    const strip = overview.querySelector(".background-strip");
    // An .lcd screen: the pixel font, and the contrast themes' Canvas reset, outline and no texture.
    expect(strip).toHaveClass("lcd");
    const readings = [...overview.querySelectorAll(".background-reading")];
    expect(readings.map((reading) => reading.querySelector("span")?.textContent)).toEqual([
      "正在后台运行",
      "进程",
      "当前合计 CPU",
      "当前合计内存",
      "今日 CPU 时间",
      "今日出现",
    ]);
    const memory = readings[3];
    expect(memory.querySelector("b")).toHaveTextContent("64");
    expect(memory.querySelector("small")).toHaveTextContent("MB");
    expect(memory).toHaveTextContent("当前合计内存64MB");
    expect(overview).not.toHaveTextContent(/Windows|子进程|排序/);
  });

  it("explains background processes and the memory column in a help bubble beside the title", async () => {
    invoke.mockResolvedValue(summary);
    const user = userEvent.setup();
    await act(async () => {
      render(<BackgroundPage />);
    });

    expect(screen.queryByText(/其余显示当日峰值/)).not.toBeInTheDocument();
    expect(screen.getByRole("table")).not.toHaveAttribute("aria-describedby");
    const title = screen.getByRole("heading", { name: "后台进程" });
    const help = screen.getByRole("button", { name: "什么是后台进程" });
    expect(title.nextElementSibling).toContainElement(help);

    await user.click(help);
    const bubble = screen.getByRole("dialog", { name: "什么是后台进程？" });
    expect(bubble).toHaveTextContent("没有窗口、也不在托盘里的第三方程序");
    // Date-neutral: the same words fit today and a past day.
    expect(bubble).toHaveTextContent("内存：运行中的进程显示当前占用，其余显示当日峰值。");
    expect(bubble).not.toHaveTextContent(/今日|今天/);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  // Border colours are forced in contrast themes, so the dotted ink rules turn CanvasText on their own;
  // a background-image rule would keep the theme ink and vanish on a dark Canvas.
  it("draws the strip's dividers as dotted ink borders", () => {
    const rules = parseRules(allCss()["styles.css"]).rules.filter((rule) =>
      rule.selectors.some((selector) => selector.includes("background-reading")),
    );
    expect(rules.length).toBeGreaterThan(0);
    const divider = rules.find((rule) => rule.selectors.includes(".background-reading + .background-reading"));
    expect(divider?.declarations["border-left"]).toMatch(/dotted .*var\(--eink-ink\)/);
    for (const rule of rules) {
      for (const [property, value] of Object.entries(rule.declarations)) {
        expect(`${rule.selector} ${property}: ${value}`).not.toMatch(/background(-image)?: .*gradient/);
      }
    }
  });

  // A reading's box stops 15px short of the 108px strip at top and bottom so the dotted rules are inset, and
  // its label and digits sit 14px apart. Clipping only sideways lets a reading taller than its box (large
  // digits at 125%) spill centred into that 15px instead of cutting the top of the label.
  it("clips the strip's readings sideways only", () => {
    const declarations = Object.assign(
      {},
      ...parseRules(allCss()["styles.css"]).rules
        .filter((rule) => rule.atRules.length === 0 && rule.selectors.includes(".background-reading"))
        .map((rule) => rule.declarations),
    );
    expect(declarations.overflow).toBeUndefined();
    expect(declarations["overflow-x"]).toBe("clip");
    expect(declarations["overflow-y"]).toBe("visible");
  });

  it("reads a past day once, with the day's four readings and only its stored columns", async () => {
    vi.useFakeTimers();
    invoke.mockResolvedValue(pastSummary);
    await act(async () => {
      render(<BackgroundPage date="2026-11-17" />);
    });

    expect(invoke).toHaveBeenCalledWith("get_background_page_summary", { date: "2026-11-17" });
    const strip = screen.getByRole("region", { name: "后台概况" }).querySelector(".background-strip");
    expect(strip).toHaveClass("is-past");
    expect([...strip!.querySelectorAll(".background-reading > span")].map((label) => label.textContent)).toEqual([
      "当日 CPU 时间",
      "当日出现",
      "当日后台时长",
      "峰值内存",
    ]);
    expect(screen.getAllByRole("columnheader").map((header) => header.textContent)).toEqual([
      "软件名称",
      "峰值进程数",
      "峰值内存",
      "当日后台时长",
      "当日 CPU 时间",
    ]);
    const row = screen.getByText("Updater").closest(".background-row") as HTMLElement;
    expect([...row.querySelectorAll("td")].slice(1).map((cell) => cell.textContent)).toEqual([
      "3",
      "2.0 GB",
      "0.0小时",
      "<1秒",
    ]);
    expect(screen.queryByText(/运行中|已退出|今日|今天/)).not.toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(15000);
    });
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it("says when a past day has no background records", async () => {
    invoke.mockResolvedValue({ ...pastSummary, rows: [] });
    await act(async () => {
      render(<BackgroundPage date="2026-11-17" />);
    });

    expect(screen.getByText("这一天没有后台记录。")).toBeInTheDocument();
    expect(screen.queryByText("今天还没有记录到后台进程。")).not.toBeInTheDocument();
  });

  it("polls today, stops on a past day and polls again back on today", async () => {
    vi.useFakeTimers();
    invoke.mockImplementation(async (_command, args?: { date?: string }) =>
      args?.date ? { ...pastSummary, usage_date: args.date } : summary,
    );
    const calls = () => invoke.mock.calls.length;
    const view = render(<BackgroundPage />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10000);
    });
    expect(calls()).toBe(3);

    view.rerender(<BackgroundPage date="2026-11-17" />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20000);
    });
    expect(calls()).toBe(4);
    expect(invoke).toHaveBeenLastCalledWith("get_background_page_summary", { date: "2026-11-17" });
    expect(screen.getByRole("columnheader", { name: "峰值进程数" })).toBeInTheDocument();

    view.rerender(<BackgroundPage />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(calls()).toBe(6);
    expect(invoke).toHaveBeenLastCalledWith("get_background_page_summary");
    expect(screen.getByRole("columnheader", { name: "当前 CPU" })).toBeInTheDocument();
  });

  it("drops a late answer for the day it has moved away from", async () => {
    let answerToday!: (value: BackgroundPageSummary) => void;
    invoke.mockImplementation((_command, args?: { date?: string }) =>
      args?.date
        ? Promise.resolve({ ...pastSummary, usage_date: args.date })
        : new Promise((resolve) => {
            answerToday = resolve;
          }),
    );
    const view = render(<BackgroundPage />);
    await act(async () => {
      view.rerender(<BackgroundPage date="2026-11-17" />);
    });
    expect(await screen.findByRole("columnheader", { name: "峰值进程数" })).toBeInTheDocument();

    await act(async () => {
      answerToday(summary);
    });
    expect(screen.getByRole("columnheader", { name: "峰值进程数" })).toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "当前 CPU" })).not.toBeInTheDocument();
    expect(screen.queryByText("运行中")).not.toBeInTheDocument();
  });

  it("hands a refused date back, so the app can return to today", async () => {
    invoke.mockRejectedValue(DAY_INVALID_DATE);
    const onInvalidDate = vi.fn();
    await act(async () => {
      render(<BackgroundPage date="2999-01-01" onInvalidDate={onInvalidDate} />);
    });

    expect(onInvalidDate).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("无法读取后台进程")).not.toBeInTheDocument();
  });

  it("falls back to the default sort when a past day hides the sorted column", async () => {
    invoke.mockImplementation(async (_command, args?: { date?: string }) =>
      args?.date ? { ...pastSummary, usage_date: args.date } : summary,
    );
    const user = userEvent.setup();
    const view = render(<BackgroundPage />);
    const header = (label: string) => screen.getByRole("columnheader", { name: label });
    await user.click(within(await screen.findByRole("columnheader", { name: "状态" })).getByRole("button"));
    expect(header("状态")).toHaveAttribute("aria-sort", "descending");

    await act(async () => {
      view.rerender(<BackgroundPage date="2026-11-17" />);
    });
    expect(await screen.findByRole("columnheader", { name: "当日 CPU 时间" })).toHaveAttribute("aria-sort", "descending");

    // A column a past day keeps stays sorted.
    await user.click(within(header("峰值进程数")).getByRole("button"));
    expect(header("峰值进程数")).toHaveAttribute("aria-sort", "descending");
    const names = () => screen.getAllByRole("row").slice(1).map((row) => row.querySelector("strong")?.textContent);
    expect(names()).toEqual(["Updater", "RazerCentralService"]);
  });

  it("sums a past day's four readings from its stored rows", () => {
    expect(pastBackgroundReadings(pastSummary)).toEqual([
      { label: "当日 CPU 时间", value: "2分钟" },
      { label: "当日出现", value: "2 个" },
      { label: "当日后台时长", value: "2.0小时" },
      { label: "峰值内存", value: "2.1 GB" },
    ]);
    expect(pastBackgroundReadings({ ...pastSummary, rows: [] }).map((reading) => reading.value)).toEqual([
      "0秒",
      "0 个",
      "0.0小时",
      "0 MB",
    ]);
  });

  it("sorts a past day's peak process counts on every row", () => {
    const rows = pastSummary.rows;
    const pick = (sorted: typeof rows) => sorted.map((row) => row.display_name);
    expect(pick(sortBackgroundRows(rows, { key: "process_count", direction: "desc" }, true))).toEqual([
      "Updater",
      "RazerCentralService",
    ]);
    expect(pick(sortBackgroundRows(rows, { key: "process_count", direction: "asc" }, true))).toEqual([
      "RazerCentralService",
      "Updater",
    ]);
  });

  // v0.4.2 加高屏幕: a taller screen keeps the 36px digits at every window width.
  it("prints the strip on the taller screen, four equal cells on a past day", () => {
    const rules = parseRules(allCss()["styles.css"]).rules;
    const declared = (selector: string) =>
      Object.assign({}, ...rules.filter((rule) => rule.selectors.includes(selector)).map((rule) => rule.declarations));
    const height = Number.parseFloat(declared(".lcd.background-strip").height);
    expect(height).toBeGreaterThanOrEqual(104);
    expect(height).toBeLessThanOrEqual(112);
    expect(declared(".lcd.background-strip.is-past")["grid-template-columns"]).toBe("repeat(4, minmax(0, 1fr))");
    const sizes = rules
      .filter((rule) => "--background-reading-size" in rule.declarations)
      .map((rule) => [rule.atRules.join(" "), rule.declarations["--background-reading-size"]]);
    expect(sizes).toEqual([
      ["", "36px"],
      ["@media (resolution: 1.25dppx)", "38.4px"],
      ["@media (resolution: 1.5dppx)", "32px"],
    ]);
    // Narrow windows keep those digits and narrow the cells' sides instead: at the 1180px minimum a long
    // 12小时34分钟 measured 132px (137px at 125%) in the 148px cell.
    const narrowPadding = rules
      .filter((rule) => rule.selectors.includes(".background-reading") && rule.atRules.length > 0)
      .map((rule) => [rule.atRules.join(" "), rule.declarations.padding]);
    expect(narrowPadding).toEqual([["@media (max-width: 1200px)", "0 10px"]]);
  });

  it("formats small and large values readably", () => {
    expect(formatPercent(0)).toBe("0%");
    expect(formatPercent(0.04)).toBe("<0.1%");
    expect(formatBytes(512 * 1024 * 1024)).toBe("512 MB");
  });
});
