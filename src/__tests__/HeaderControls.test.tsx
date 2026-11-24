import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DatabaseBackup, FileInput, FileOutput } from "lucide-react";
import { DateControl } from "../components/DateControl";
import { addLocalDays, parseLocalDate, weekdayLabel } from "../components/DayCalendar";
import { ExportKey, type ExportKeyItem } from "../components/ExportKey";
import { RangeControl } from "../components/RangeControl";
import { Toast } from "../components/Toast";
import { PAGE_EXPORTS } from "../pageExports";
import { allCss, parseRules } from "./support/css";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function renderDateControl(overrides: Partial<Parameters<typeof DateControl>[0]> = {}) {
  const onChange = vi.fn();
  const props = {
    value: "2026-11-24",
    today: "2026-11-24",
    dataStartDate: "2026-10-28",
    onChange,
    ...overrides,
  };
  const view = render(<DateControl {...props} />);
  return { ...view, onChange, props };
}

const dateKey = () => screen.getByRole("button", { name: /，打开日历$/ });
const day = (calendar: HTMLElement, label: RegExp) => within(calendar).getByRole("button", { name: label });
const cellOf = (button: HTMLElement) => button.closest("td") as HTMLElement;

function openCalendar() {
  fireEvent.click(dateKey());
  return screen.getByRole("dialog", { name: "选择日期" });
}

describe("date helpers", () => {
  it("steps whole local days across months and a DST change", () => {
    expect(addLocalDays("2026-11-01", -1)).toBe("2026-10-31");
    expect(addLocalDays("2026-03-29", 1)).toBe("2026-03-30");
    expect(addLocalDays("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("reads only real YYYY-MM-DD dates", () => {
    expect(parseLocalDate("2026-11-24")?.getDate()).toBe(24);
    expect(parseLocalDate("2026-02-30")).toBeNull();
    expect(parseLocalDate("2026-1-1")).toBeNull();
    expect(parseLocalDate(null)).toBeNull();
    expect(weekdayLabel("2026-11-24")).toBe("周二");
  });
});

describe("DateControl", () => {
  it("shows the date with its weekday and announces that it opens a calendar", () => {
    renderDateControl();

    expect(screen.getByRole("group", { name: "查看日期" })).toBeInTheDocument();
    expect(dateKey()).toHaveAccessibleName("2026年11月24日 星期二，打开日历");
    expect(dateKey()).toHaveTextContent("2026-11-24周二");
    expect(dateKey()).toHaveAttribute("aria-haspopup", "dialog");
    expect(dateKey()).toHaveAttribute("aria-expanded", "false");
  });

  it("disables › on today and hides the 今天 key", () => {
    renderDateControl();

    expect(screen.getByRole("button", { name: "后一天" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "前一天" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "今天" })).not.toBeInTheDocument();
  });

  it("steps a day back and forward on a past day, and 今天 jumps back", () => {
    const { onChange } = renderDateControl({ value: "2026-11-17" });

    fireEvent.click(screen.getByRole("button", { name: "前一天" }));
    expect(onChange).toHaveBeenLastCalledWith("2026-11-16");
    fireEvent.click(screen.getByRole("button", { name: "后一天" }));
    expect(onChange).toHaveBeenLastCalledWith("2026-11-18");
    fireEvent.click(screen.getByRole("button", { name: "今天" }));
    expect(onChange).toHaveBeenLastCalledWith("2026-11-24");
  });

  it("disables ‹ at the data start date and before any data", () => {
    renderDateControl({ value: "2026-10-28" });
    expect(screen.getByRole("button", { name: "前一天" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "后一天" })).toBeEnabled();
    cleanup();

    renderDateControl({ dataStartDate: null });
    expect(screen.getByRole("button", { name: "前一天" })).toBeDisabled();
  });

  it("hands focus to the date key when a step reaches today", () => {
    renderDateControl({ value: "2026-11-23" });

    fireEvent.click(screen.getByRole("button", { name: "后一天" }));
    expect(dateKey()).toHaveFocus();
  });

  it("opens a Monday-first zh-CN calendar of the viewed month with the day focused", () => {
    renderDateControl({ value: "2026-11-17" });
    const calendar = openCalendar();

    expect(dateKey()).toHaveAttribute("aria-expanded", "true");
    const weekdays = Array.from(calendar.querySelectorAll(".rdp-weekday"), (header) => header.textContent);
    expect(weekdays).toEqual(["一", "二", "三", "四", "五", "六", "日"]);
    expect(within(calendar).getByRole("button", { name: "2026年11月，选择年月" })).toHaveTextContent("2026年11月");
    // Six fixed weeks.
    expect(calendar.querySelectorAll(".rdp-week")).toHaveLength(6);
    const selected = day(calendar, /^2026年11月17日/);
    expect(selected).toHaveFocus();
    expect(cellOf(selected)).toHaveClass("rdp-selected");
    expect(cellOf(day(calendar, /^今天，2026年11月24日/))).toHaveClass("rdp-today");
  });

  it("disables future days and days before the data start, and keeps in-range outside days", () => {
    renderDateControl({ value: "2026-11-17" });
    const calendar = openCalendar();

    expect(day(calendar, /^2026年11月25日/)).toBeDisabled();
    // October days from the 26th lead the first week; the data starts on the 28th.
    expect(day(calendar, /^2026年10月27日/)).toBeDisabled();
    const outside = day(calendar, /^2026年10月30日/);
    expect(outside).toBeEnabled();
    expect(cellOf(outside)).toHaveClass("rdp-outside");
  });

  it("is a plain date picker printed straight on the popover's e-ink surface", () => {
    renderDateControl({ value: "2026-11-17" });
    const calendar = openCalendar();

    // The popover itself is the e-ink paper; the grid has no framed screen of its own.
    expect(calendar).toHaveClass("glass-pop", "hk-cal-pop", "paper");
    expect(calendar.querySelectorAll(".paper")).toHaveLength(0);
    expect(calendar.querySelector(".lcd-cal > table")).not.toBeNull();
    // No per-day data: every cell carries only react-day-picker's own day states.
    const cells = Array.from(calendar.querySelectorAll("td"));
    expect(cells).toHaveLength(42);
    cells.forEach((cell) =>
      cell.classList.forEach((name) =>
        expect(name).toMatch(/^rdp-(day|outside|today|selected|disabled|focused)$/),
      ),
    );
  });

  it("picks a day, closes and returns focus to the date key", () => {
    const { onChange } = renderDateControl();
    const calendar = openCalendar();

    fireEvent.click(day(calendar, /^2026年11月4日/));
    expect(onChange).toHaveBeenCalledWith("2026-11-04");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(dateKey()).toHaveFocus();
  });

  it("moves between days with the arrow keys", () => {
    renderDateControl({ value: "2026-11-17" });
    const calendar = openCalendar();

    fireEvent.keyDown(day(calendar, /^2026年11月17日/), { key: "ArrowLeft" });
    expect(day(calendar, /^2026年11月16日/)).toHaveFocus();
    fireEvent.keyDown(day(calendar, /^2026年11月16日/), { key: "ArrowUp" });
    expect(day(calendar, /^2026年11月9日/)).toHaveFocus();
  });

  it("closes on Escape and returns focus to the date key", () => {
    renderDateControl();
    openCalendar();

    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(dateKey()).toHaveFocus();
  });

  it("closes on a press outside and returns focus to the date key", async () => {
    render(<p>outside</p>);
    renderDateControl();
    openCalendar();

    fireEvent.pointerDown(screen.getByText("outside"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await waitFor(() => expect(dateKey()).toHaveFocus());
  });

  it("switches the caption to a month view of the same popover and back", () => {
    renderDateControl({ value: "2026-11-17" });
    const calendar = openCalendar();

    expect(within(calendar).getByRole("button", { name: "下个月" })).toBeDisabled();
    fireEvent.click(within(calendar).getByRole("button", { name: "2026年11月，选择年月" }));
    const months = within(calendar).getByRole("group", { name: "2026年" });
    expect(within(months).getByRole("button", { name: "11月" })).toHaveAttribute("aria-pressed", "true");
    expect(within(months).getByRole("button", { name: "11月" })).toHaveFocus();
    expect(within(months).getByRole("button", { name: "12月" })).toBeDisabled();
    expect(within(months).getByRole("button", { name: "9月" })).toBeDisabled();
    expect(within(calendar).getByRole("button", { name: "上一年" })).toBeDisabled();
    expect(within(calendar).getByRole("button", { name: "下一年" })).toBeDisabled();

    fireEvent.click(within(months).getByRole("button", { name: "10月" }));
    expect(within(calendar).getByRole("button", { name: "2026年10月，选择年月" })).toBeInTheDocument();
    expect(within(calendar).getByRole("button", { name: "上个月" })).toBeDisabled();
  });

  it("prints the month view like the day grid: pixel type on the paper, no raised keys", () => {
    renderDateControl({ value: "2026-11-17" });
    const calendar = openCalendar();
    fireEvent.click(within(calendar).getByRole("button", { name: "2026年11月，选择年月" }));
    const months = within(calendar).getByRole("group", { name: "2026年" });

    expect(months).toHaveClass("lcd-months");
    within(months)
      .getAllByRole("button")
      .forEach((month) => expect(month).not.toHaveClass("cal-key"));
    expect(within(months).getByRole("button", { name: "11月" })).toHaveClass("cal-month", "is-current");
    const rule = (selector: string) =>
      parseRules(allCss()["HeaderControls.css"]).rules.find(
        (candidate) => candidate.atRules.length === 0 && candidate.selectors.includes(selector),
      )?.declarations;
    expect(rule(".cal-month.is-current")).toMatchObject({ background: "var(--eink-ink)", color: "var(--eink-paper-solid)" });
  });

  it("closes the whole popover on Escape in the month view and returns focus to the date key", () => {
    const { onChange } = renderDateControl({ value: "2026-11-17" });
    const calendar = openCalendar();
    fireEvent.click(within(calendar).getByRole("button", { name: "2026年11月，选择年月" }));
    const month = within(calendar).getByRole("button", { name: "10月" });
    month.focus();

    fireEvent.keyDown(month, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(dateKey()).toHaveFocus();
    expect(onChange).not.toHaveBeenCalled();
    // It opens on the day view again.
    expect(within(openCalendar()).getByRole("grid")).toBeInTheDocument();
  });

  it("prints the data start month's leading days as faint disabled days, not blanks", () => {
    renderDateControl({ value: "2026-10-28" });
    const calendar = openCalendar();

    // October 2026 starts on a Thursday: Monday 28 September leads the first week.
    const leading = day(calendar, /^2026年9月28日/);
    expect(leading).toBeDisabled();
    expect(cellOf(leading)).toHaveClass("rdp-outside", "rdp-disabled");
    expect(cellOf(leading)).not.toHaveClass("rdp-hidden");
  });

  it("hands focus to the caption key when a month or year key reaches the end", () => {
    renderDateControl({ value: "2026-11-17", dataStartDate: "2025-11-20" });
    const calendar = openCalendar();
    const caption = () => within(calendar).getByRole("button", { name: /选择年月$|返回日历$/ });

    fireEvent.click(within(calendar).getByRole("button", { name: "2026年11月，选择年月" }));
    within(calendar).getByRole("button", { name: "上一年" }).focus();
    fireEvent.click(within(calendar).getByRole("button", { name: "上一年" }));
    expect(within(calendar).getByRole("button", { name: "上一年" })).toBeDisabled();
    expect(caption()).toHaveFocus();
    within(calendar).getByRole("button", { name: "下一年" }).focus();
    fireEvent.click(within(calendar).getByRole("button", { name: "下一年" }));
    expect(within(calendar).getByRole("button", { name: "下一年" })).toBeDisabled();
    expect(caption()).toHaveFocus();

    fireEvent.click(within(calendar).getByRole("button", { name: "10月" }));
    within(calendar).getByRole("button", { name: "下个月" }).focus();
    fireEvent.click(within(calendar).getByRole("button", { name: "下个月" }));
    expect(within(calendar).getByRole("button", { name: "下个月" })).toBeDisabled();
    expect(caption()).toHaveFocus();

    fireEvent.click(caption());
    fireEvent.click(within(calendar).getByRole("button", { name: "上一年" }));
    fireEvent.click(within(calendar).getByRole("button", { name: "12月" }));
    within(calendar).getByRole("button", { name: "上个月" }).focus();
    fireEvent.click(within(calendar).getByRole("button", { name: "上个月" }));
    expect(within(calendar).getByRole("button", { name: "2025年11月，选择年月" })).toHaveFocus();
    expect(within(calendar).getByRole("button", { name: "上个月" })).toBeDisabled();
  });
});

describe("RangeControl", () => {
  it("shows the first pick alone, then reports both ends in order", () => {
    const onChange = vi.fn();
    render(
      <RangeControl
        value={{ start: "2026-11-15", end: "2026-11-21" }}
        today="2026-11-24"
        dataStartDate="2026-10-28"
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "统计区间 2026-11-15 至 2026-11-21，打开日历" }));
    const calendar = screen.getByRole("dialog", { name: "选择统计区间" });
    expect(cellOf(day(calendar, /^2026年11月18日/))).toHaveClass("rdp-range_middle");

    fireEvent.click(day(calendar, /^2026年11月20日/));
    expect(onChange).not.toHaveBeenCalled();
    expect(cellOf(day(calendar, /^2026年11月18日/))).not.toHaveClass("rdp-range_middle");
    expect(cellOf(day(calendar, /^2026年11月20日/))).toHaveClass("rdp-selected");

    fireEvent.click(day(calendar, /^2026年11月3日/));
    expect(onChange).toHaveBeenCalledWith({ start: "2026-11-03", end: "2026-11-20" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it.each([
    ["Escape", (target: Element) => fireEvent.keyDown(target, { key: "Escape" })],
    ["a press outside", () => fireEvent.pointerDown(screen.getByText("outside"))],
  ])("closes on %s, returns focus to the range key and drops a half-picked range", async (_how, dismiss) => {
    const onChange = vi.fn();
    render(<p>outside</p>);
    render(
      <RangeControl
        value={{ start: "2026-11-15", end: "2026-11-21" }}
        today="2026-11-24"
        dataStartDate="2026-10-28"
        onChange={onChange}
      />,
    );
    const key = screen.getByRole("button", { name: /^统计区间/ });
    fireEvent.click(key);
    let calendar = screen.getByRole("dialog", { name: "选择统计区间" });
    const anchor = day(calendar, /^2026年11月20日/);
    anchor.focus();
    fireEvent.click(anchor);
    expect(cellOf(day(calendar, /^2026年11月18日/))).not.toHaveClass("rdp-range_middle");

    dismiss(document.activeElement ?? document.body);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await waitFor(() => expect(key).toHaveFocus());
    expect(key).toHaveAttribute("aria-expanded", "false");
    expect(onChange).not.toHaveBeenCalled();

    fireEvent.click(key);
    calendar = screen.getByRole("dialog", { name: "选择统计区间" });
    expect(cellOf(day(calendar, /^2026年11月18日/))).toHaveClass("rdp-range_middle");
    expect(cellOf(day(calendar, /^2026年11月15日/))).toHaveClass("rdp-range_start");
  });

  it("marks the range's ends and middle days for the band", () => {
    render(
      <RangeControl
        value={{ start: "2026-11-01", end: "2026-11-21" }}
        today="2026-11-24"
        dataStartDate="2026-10-28"
        onChange={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /^统计区间/ }));
    const calendar = screen.getByRole("dialog", { name: "选择统计区间" });

    expect(calendar).toHaveClass("paper");
    expect(cellOf(day(calendar, /^2026年11月1日/))).toHaveClass("rdp-range_start", "rdp-selected");
    expect(cellOf(day(calendar, /^2026年11月3日/))).toHaveClass("rdp-range_middle");
    expect(cellOf(day(calendar, /^2026年11月21日/))).toHaveClass("rdp-range_end", "rdp-selected");
    expect(cellOf(day(calendar, /^2026年11月22日/))).not.toHaveClass("rdp-selected");
  });
});

const MENU: ExportKeyItem<"export" | "import" | "backup">[] = [
  { id: "export", title: "导出设置", format: "JSON", icon: FileOutput },
  { id: "import", title: "导入设置…", icon: FileInput },
  { id: "backup", title: "备份全部数据", format: "DB", icon: DatabaseBackup, separatorBefore: true },
];

describe("ExportKey", () => {
  it("saves a one-format export straight from the key, with its format tag and no menu", () => {
    const onSelect = vi.fn();
    render(<ExportKey label="导出日报" items={[{ id: "csv", title: "日报", format: "CSV" }]} onSelect={onSelect} />);

    const key = screen.getByRole("button", { name: "导出日报 CSV" });
    expect(key).not.toHaveAttribute("aria-haspopup");
    expect(key).toHaveTextContent("导出日报CSV");
    expect(key.querySelector(".hk-caret")).toBeNull();
    fireEvent.click(key);
    expect(onSelect).toHaveBeenCalledWith("csv");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("ignores presses while busy without looking disabled", () => {
    const onSelect = vi.fn();
    render(<ExportKey label="导出日报" items={[{ id: "csv", title: "日报", format: "CSV" }]} onSelect={onSelect} busy />);

    const key = screen.getByRole("button", { name: "导出日报 CSV" });
    expect(key).toBeEnabled();
    expect(key).toHaveAttribute("aria-busy", "true");
    fireEvent.click(key);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("opens a menu of icon, title and format rows with the first row focused", () => {
    const onSelect = vi.fn();
    render(<ExportKey label="迁移与备份" items={MENU} onSelect={onSelect} />);

    const key = screen.getByRole("button", { name: "迁移与备份" });
    expect(key).toHaveAttribute("aria-haspopup", "menu");
    fireEvent.click(key);
    const menu = screen.getByRole("menu", { name: "迁移与备份" });
    const rows = within(menu).getAllByRole("menuitem");
    expect(rows.map((row) => row.textContent)).toEqual(["导出设置JSON", "导入设置…", "备份全部数据DB"]);
    expect(within(menu).getAllByRole("separator")).toHaveLength(1);
    expect(rows[0]).toHaveFocus();
    expect(key).toHaveAttribute("aria-expanded", "true");

    fireEvent.click(rows[2]);
    expect(onSelect).toHaveBeenCalledWith("backup");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(key).toHaveFocus();
  });

  it("moves through the menu with the arrow, Home and End keys and closes on Escape", () => {
    render(<ExportKey label="迁移与备份" items={MENU} onSelect={() => {}} />);
    const key = screen.getByRole("button", { name: "迁移与备份" });

    fireEvent.keyDown(key, { key: "ArrowDown" });
    const rows = within(screen.getByRole("menu")).getAllByRole("menuitem");
    expect(rows[0]).toHaveFocus();
    fireEvent.keyDown(rows[0], { key: "ArrowDown" });
    expect(rows[1]).toHaveFocus();
    fireEvent.keyDown(rows[1], { key: "End" });
    expect(rows[2]).toHaveFocus();
    fireEvent.keyDown(rows[2], { key: "ArrowDown" });
    expect(rows[0]).toHaveFocus();
    fireEvent.keyDown(rows[0], { key: "ArrowUp" });
    expect(rows[2]).toHaveFocus();
    fireEvent.keyDown(rows[2], { key: "Home" });
    expect(rows[0]).toHaveFocus();

    fireEvent.keyDown(rows[0], { key: "Escape" });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(key).toHaveFocus();
  });

  it("closes on Tab from a row without trapping it", () => {
    render(<ExportKey label="迁移与备份" items={MENU} onSelect={() => {}} />);
    const key = screen.getByRole("button", { name: "迁移与备份" });
    fireEvent.click(key);
    const row = within(screen.getByRole("menu")).getAllByRole("menuitem")[1];
    row.focus();

    const tab = fireEvent.keyDown(row, { key: "Tab" });
    expect(tab).toBe(true); // not prevented: the browser moves focus on as usual
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(key).toHaveAttribute("aria-expanded", "false");
  });

  it("closes on a press outside and hands focus back to the key", async () => {
    const onSelect = vi.fn();
    render(<p>outside</p>);
    render(<ExportKey label="迁移与备份" items={MENU} onSelect={onSelect} />);
    const key = screen.getByRole("button", { name: "迁移与备份" });
    fireEvent.click(key);
    expect(within(screen.getByRole("menu")).getAllByRole("menuitem")[0]).toHaveFocus();

    fireEvent.pointerDown(screen.getByText("outside"));
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    await waitFor(() => expect(key).toHaveFocus());
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("closes when focus moves to another control, and leaves focus there", async () => {
    render(<button type="button">另一个键</button>);
    render(<ExportKey label="迁移与备份" items={MENU} onSelect={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "迁移与备份" }));
    expect(screen.getByRole("menu")).toBeInTheDocument();

    const other = screen.getByRole("button", { name: "另一个键" });
    act(() => {
      other.focus();
    });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    await new Promise((resolve) => window.setTimeout(resolve, 10));
    expect(other).toHaveFocus();
  });

  it("opens on ArrowUp at the last row", () => {
    render(<ExportKey label="迁移与备份" items={MENU} onSelect={() => {}} />);

    fireEvent.keyDown(screen.getByRole("button", { name: "迁移与备份" }), { key: "ArrowUp" });
    expect(within(screen.getByRole("menu")).getAllByRole("menuitem")[2]).toHaveFocus();
  });
});

describe("page export keys (v0.4.2 C, v0.4.3 C to E)", () => {
  const rows = (page: keyof typeof PAGE_EXPORTS) => PAGE_EXPORTS[page].items.map((item) => [item.title, item.format ?? null]);

  it("gives 软件 and 后台 a one-format CSV key, 成就 a one-format PNG key, and the others menus", () => {
    expect(PAGE_EXPORTS.software.label).toBe("导出软件清单");
    expect(PAGE_EXPORTS.background.label).toBe("导出后台记录");
    for (const page of ["software", "background"] as const) {
      expect(PAGE_EXPORTS[page].items.map((item) => item.format)).toEqual(["CSV"]);
    }
    expect(PAGE_EXPORTS.achievements.label).toBe("导出成就");
    expect(rows("achievements")).toEqual([["成就海报", "PNG"]]);
    expect(PAGE_EXPORTS.overview.label).toBe("导出日报");
    expect(rows("overview")).toEqual([
      ["日报海报", "PNG"],
      ["当日明细", "CSV"],
    ]);
    expect(PAGE_EXPORTS.statistics.label).toBe("导出报表");
    expect(rows("statistics")).toEqual([
      ["区间汇总", "CSV"],
      ["每日明细", "CSV"],
    ]);
    expect(PAGE_EXPORTS.settings.label).toBe("迁移与备份");
    expect(rows("settings")).toEqual([
      ["导出设置", "JSON"],
      ["导入设置…", null],
      ["备份全部数据", "DB"],
    ]);
  });

  it("shows an unavailable one-format key dimmed with its reason, and ignores presses", async () => {
    const onSelect = vi.fn();
    render(<ExportKey label="导出成就" items={[{ id: "a", title: "成就海报", format: "PNG" }]} unavailable="暂无里程碑" onSelect={onSelect} />);

    const key = screen.getByRole("button", { name: "导出成就 PNG" });
    expect(key).toHaveAttribute("aria-disabled", "true");
    expect(key).not.toBeDisabled();
    await userEvent.hover(key);
    expect(screen.getByRole("tooltip")).toHaveTextContent("暂无里程碑");
    expect(key).toHaveAccessibleDescription("暂无里程碑");
    await userEvent.click(key);
    key.focus();
    await userEvent.keyboard("{Enter}");
    expect(onSelect).not.toHaveBeenCalled();
  });
});

describe("Toast", () => {
  const saved = (id = 1) => ({ id, message: "已保存", action: { label: "在文件夹中显示", onClick: vi.fn() } });

  it("keeps empty status and alert regions mounted before any message", () => {
    render(<Toast toast={null} onDismiss={() => {}} />);
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
    expect(screen.getByRole("alert")).toBeEmptyDOMElement();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("puts a status into the mounted region, with its action key, and hides after about 6 s", () => {
    vi.useFakeTimers();
    const onDismiss = vi.fn();
    const { rerender } = render(<Toast toast={null} onDismiss={onDismiss} />);
    const region = screen.getByRole("status");
    const toast = saved();
    rerender(<Toast toast={toast} onDismiss={onDismiss} />);

    expect(screen.getByRole("status")).toBe(region);
    expect(region).toHaveTextContent("已保存");
    expect(screen.getByRole("alert")).toBeEmptyDOMElement();
    fireEvent.click(screen.getByRole("button", { name: "在文件夹中显示" }));
    expect(toast.action.onClick).toHaveBeenCalledTimes(1);

    act(() => {
      vi.advanceTimersByTime(5999);
    });
    expect(onDismiss).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("replaces the text node for the same message shown again, and times it again", () => {
    vi.useFakeTimers();
    const onDismiss = vi.fn();
    const { rerender } = render(<Toast toast={saved(1)} onDismiss={onDismiss} />);
    const first = screen.getByRole("status").firstChild;
    act(() => {
      vi.advanceTimersByTime(4000);
    });
    rerender(<Toast toast={saved(2)} onDismiss={onDismiss} />);
    expect(screen.getByRole("status").firstChild).not.toBe(first);
    act(() => {
      vi.advanceTimersByTime(4000);
    });
    expect(onDismiss).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("stays while the pointer rests on it", () => {
    vi.useFakeTimers();
    const onDismiss = vi.fn();
    render(<Toast toast={{ id: 1, message: "已保存" }} onDismiss={onDismiss} />);
    const box = screen.getByRole("status").parentElement as HTMLElement;

    fireEvent.pointerEnter(box);
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(onDismiss).not.toHaveBeenCalled();
    fireEvent.pointerLeave(box);
    act(() => {
      vi.advanceTimersByTime(6000);
    });
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("holds while keyboard focus is on its key, and lets the next toast go once that key is gone", () => {
    vi.useFakeTimers();
    const onDismiss = vi.fn();
    const { rerender } = render(<Toast toast={saved(1)} onDismiss={onDismiss} />);
    // Tab onto the key: keyboard focus, so :focus-visible.
    fireEvent.keyDown(document.body, { key: "Tab" });
    act(() => {
      screen.getByRole("button", { name: "在文件夹中显示" }).focus();
    });
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(onDismiss).not.toHaveBeenCalled();

    // 无法打开文件夹 replaces it with no key: the focused key goes away without a focusout.
    rerender(<Toast toast={{ id: 2, message: "无法打开文件夹", tone: "error" }} onDismiss={onDismiss} />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(6000);
    });
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("does not hold for focus a click leaves on its key", () => {
    vi.useFakeTimers();
    const onDismiss = vi.fn();
    render(<Toast toast={saved(1)} onDismiss={onDismiss} />);
    const key = screen.getByRole("button", { name: "在文件夹中显示" });
    fireEvent.pointerDown(key);
    act(() => {
      key.focus();
    });
    fireEvent.pointerUp(key);
    fireEvent.click(key);
    expect(key).toHaveFocus();
    act(() => {
      vi.advanceTimersByTime(6000);
    });
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("sits above the modal scrim and below the help popovers, so 保存失败 stays readable over a dialog", () => {
    const zIndex = (file: string, selector: string) =>
      Number(
        parseRules(allCss()[file]).rules.find(
          (rule) => rule.atRules.length === 0 && rule.selectors.includes(selector) && rule.declarations["z-index"],
        )?.declarations["z-index"],
      );
    expect(zIndex("HeaderControls.css", ".toast")).toBeGreaterThan(zIndex("styles.css", ".modal-backdrop"));
    expect(zIndex("HeaderControls.css", ".toast")).toBeLessThan(zIndex("styles.css", ".active-help-popover"));
  });

  it("marks a message with a status icon that screen readers skip, and none while idle", () => {
    const { container, rerender } = render(<Toast toast={null} onDismiss={() => {}} />);
    expect(container.querySelector(".toast-icon")).toBeNull();
    rerender(<Toast toast={saved()} onDismiss={() => {}} />);
    expect(container.querySelector(".toast-icon")).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByRole("status")).toHaveTextContent(/^已保存$/);
  });

  it("reads a failure as an alert", () => {
    render(<Toast toast={{ id: 1, message: "保存失败", tone: "error" }} onDismiss={() => {}} />);
    expect(screen.getByRole("alert")).toHaveTextContent("保存失败");
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
  });
});
