import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DatabaseBackup, FileInput, FileOutput } from "lucide-react";
import { DateControl } from "../components/DateControl";
import { addLocalDays, parseLocalDate, weekdayLabel } from "../components/DayCalendar";
import { ExportKey, type ExportKeyItem } from "../components/ExportKey";
import { RangeControl } from "../components/RangeControl";
import { Toast } from "../components/Toast";
import { PAGE_EXPORTS } from "../pageExports";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const H = 3600;
const DAYS = [
  { date: "2026-11-02", active_seconds: 60 }, // under 5 minutes: level 0
  { date: "2026-11-03", active_seconds: 20 * 60 }, // level 1
  { date: "2026-11-04", active_seconds: 2 * H }, // level 2
  { date: "2026-11-05", active_seconds: 5 * H }, // level 3
  { date: "2026-10-30", active_seconds: 5 * H }, // October, shown as an outside day
];

function renderDateControl(overrides: Partial<Parameters<typeof DateControl>[0]> = {}) {
  const onChange = vi.fn();
  const props = {
    value: "2026-11-24",
    today: "2026-11-24",
    dataStartDate: "2026-10-28",
    days: DAYS,
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
    expect(cellOf(day(calendar, /^2026年11月25日/))).toHaveClass("cal-future");
    // October days from the 26th lead the first week; the data starts on the 28th.
    expect(day(calendar, /^2026年10月27日/)).toBeDisabled();
    expect(cellOf(day(calendar, /^2026年10月27日/))).toHaveClass("cal-before-data");
    const outside = day(calendar, /^2026年10月30日/);
    expect(outside).toBeEnabled();
    expect(cellOf(outside)).toHaveClass("rdp-outside");
  });

  it("shades recorded days by the heatmap levels and leaves the others unshaded", () => {
    renderDateControl({ value: "2026-11-17" });
    const calendar = openCalendar();

    expect(cellOf(day(calendar, /^2026年11月2日/))).toHaveClass("cal-lv0");
    expect(cellOf(day(calendar, /^2026年11月3日/))).toHaveClass("cal-lv1");
    expect(cellOf(day(calendar, /^2026年11月4日/))).toHaveClass("cal-lv2");
    expect(cellOf(day(calendar, /^2026年11月5日/))).toHaveClass("cal-lv3");
    const plain = cellOf(day(calendar, /^2026年11月6日/));
    expect(plain.className).not.toMatch(/cal-lv/);
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

  it("prints the data start month's leading days as faint disabled days, not blanks", () => {
    renderDateControl({ value: "2026-10-28" });
    const calendar = openCalendar();

    // October 2026 starts on a Thursday: Monday 28 September leads the first week.
    const leading = day(calendar, /^2026年9月28日/);
    expect(leading).toBeDisabled();
    expect(cellOf(leading)).toHaveClass("rdp-outside", "cal-before-data");
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
        days={DAYS}
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

  it("shades the range's days with the given 没用 threshold", () => {
    render(
      <RangeControl
        value={{ start: "2026-11-01", end: "2026-11-21" }}
        today="2026-11-24"
        dataStartDate="2026-10-28"
        days={DAYS}
        thresholdSeconds={30 * 60}
        onChange={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /^统计区间/ }));
    const calendar = screen.getByRole("dialog", { name: "选择统计区间" });
    // 20 active minutes is level 1 at the default 5 minutes, level 0 under a 30-minute threshold.
    const middle = cellOf(day(calendar, /^2026年11月3日/));
    expect(middle).toHaveClass("rdp-range_middle", "cal-lv0");
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

  it("opens on ArrowUp at the last row", () => {
    render(<ExportKey label="迁移与备份" items={MENU} onSelect={() => {}} />);

    fireEvent.keyDown(screen.getByRole("button", { name: "迁移与备份" }), { key: "ArrowUp" });
    expect(within(screen.getByRole("menu")).getAllByRole("menuitem")[2]).toHaveFocus();
  });
});

describe("page export keys (decision C)", () => {
  it("gives the data pages a one-format CSV key and 设置 a three-row menu; 成就 has none", () => {
    expect(PAGE_EXPORTS.overview.label).toBe("导出日报");
    expect(PAGE_EXPORTS.software.label).toBe("导出软件清单");
    expect(PAGE_EXPORTS.background.label).toBe("导出后台记录");
    expect(PAGE_EXPORTS.statistics.label).toBe("导出报表");
    for (const page of ["overview", "software", "background", "statistics"] as const) {
      expect(PAGE_EXPORTS[page].items.map((item) => item.format)).toEqual(["CSV"]);
    }
    expect(PAGE_EXPORTS.settings.label).toBe("迁移与备份");
    expect(PAGE_EXPORTS.settings.items.map((item) => [item.title, item.format ?? null])).toEqual([
      ["导出设置", "JSON"],
      ["导入设置…", null],
      ["备份全部数据", "DB"],
    ]);
    expect(Object.keys(PAGE_EXPORTS)).not.toContain("achievements");
  });
});

describe("Toast", () => {
  it("announces a status with its action key and hides itself after about 6 s", () => {
    vi.useFakeTimers();
    const onDismiss = vi.fn();
    const reveal = vi.fn();
    render(<Toast message="已保存" action={{ label: "在文件夹中显示", onClick: reveal }} onDismiss={onDismiss} />);

    expect(screen.getByRole("status")).toHaveTextContent("已保存");
    fireEvent.click(screen.getByRole("button", { name: "在文件夹中显示" }));
    expect(reveal).toHaveBeenCalledTimes(1);

    act(() => {
      vi.advanceTimersByTime(5999);
    });
    expect(onDismiss).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("stays while the pointer rests on it", () => {
    vi.useFakeTimers();
    const onDismiss = vi.fn();
    render(<Toast message="已保存" onDismiss={onDismiss} />);

    fireEvent.pointerEnter(screen.getByRole("status"));
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(onDismiss).not.toHaveBeenCalled();
    fireEvent.pointerLeave(screen.getByRole("status"));
    act(() => {
      vi.advanceTimersByTime(6000);
    });
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("reads a failure as an alert", () => {
    render(<Toast message="保存失败" tone="error" onDismiss={() => {}} />);
    expect(screen.getByRole("alert")).toHaveTextContent("保存失败");
  });
});
