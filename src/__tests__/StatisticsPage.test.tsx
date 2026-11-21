import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RankingRow, StatisticsDay, StatisticsSummary } from "../api";
import { StatisticsPage } from "../components/StatisticsPage";

const invoke = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/api/core", () => ({ invoke }));

const H = 3600;

beforeEach(() => {
  // Saturday 2026-11-21, local time. Only Date is faked so polling timers stay real.
  vi.useFakeTimers({ now: new Date(2026, 10, 21, 12, 0), toFake: ["Date"] });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  invoke.mockReset();
});

function day(date: string, recorded: number, active: number, detail = true): StatisticsDay {
  return {
    date,
    recorded_seconds: recorded,
    active_seconds: active,
    tracker_uptime_seconds: recorded === 0 ? 0 : recorded + H,
    first_recorded_at: recorded === 0 ? null : `${date}T09:00:00+08:00`,
    last_recorded_at: recorded === 0 ? null : `${date}T23:00:00+08:00`,
    has_software_detail: detail,
  };
}

function rankRow(key: string, rank: number, previousRank: number | null, isNew = false): RankingRow {
  return {
    identity_key: key,
    display_name: key,
    icon_url: null,
    rank,
    previous_rank: previousRank,
    is_new: isNew,
    focused_seconds: (10 - rank) * H,
    previous_focused_seconds: 0,
    window_seconds: (12 - rank) * H,
  };
}

// 7 days, the first two without records: recorded 100 h, active 25 h, 日均活跃 25 / 7 ≈ 3.6 h.
function summary(overrides: Partial<StatisticsSummary> = {}): StatisticsSummary {
  return {
    start: "2026-11-15",
    end: "2026-11-21",
    days_count: 7,
    previous_start: "2026-11-08",
    previous_end: "2026-11-14",
    data_start_date: "2026-05-29",
    software_detail_start_date: "2026-06-18",
    days_without_software_detail: 0,
    system_comparison_available: true,
    software_comparison_available: true,
    previous_recorded_seconds: 125 * H,
    previous_active_seconds: 20 * H,
    days: [
      day("2026-11-15", 0, 0),
      day("2026-11-16", 0, 0),
      day("2026-11-17", 20 * H, 5 * H),
      day("2026-11-18", 20 * H, 5 * H),
      day("2026-11-19", 20 * H, 5 * H),
      day("2026-11-20", 20 * H, 5 * H),
      day("2026-11-21", 20 * H, 5 * H),
    ],
    ranking: [
      rankRow("Claude", 1, 3),
      rankRow("ChatGPT", 2, 2),
      rankRow("Edge", 3, 2),
      rankRow("Notes", 4, null, true),
    ],
    idle_open: [
      {
        identity_key: "wechat",
        display_name: "微信",
        icon_url: null,
        window_seconds: 40 * H,
        focused_seconds: H,
        idle_seconds: 39 * H,
      },
    ],
    sessions: [
      {
        identity_key: "edge",
        display_name: "Microsoft Edge",
        icon_url: null,
        launch_count: 41,
        average_seconds: 1800,
        longest_seconds: 10 * H,
      },
    ],
    ...overrides,
  };
}

function statisticsCalls() {
  return invoke.mock.calls.filter(([command]) => command === "get_statistics_summary");
}

function lastStatisticsCall() {
  const calls = statisticsCalls();
  return calls[calls.length - 1];
}

async function renderPage(props: Parameters<typeof StatisticsPage>[0] = {}) {
  await act(async () => {
    render(<StatisticsPage {...props} />);
  });
}

describe("StatisticsPage", () => {
  it("requests the last 7 days without hidden software by default", async () => {
    invoke.mockResolvedValue(summary());
    await renderPage();

    expect(statisticsCalls()).toEqual([
      ["get_statistics_summary", { start: "2026-11-15", end: "2026-11-21", includeHidden: false }],
    ]);
    expect(screen.getByRole("radio", { name: "近 7 天" })).toHaveAttribute("aria-checked", "true");
  });

  it("requests the new range when the preset changes and ignores a late older response", async () => {
    let resolveFirst!: (value: StatisticsSummary) => void;
    const first = new Promise<StatisticsSummary>((resolve) => {
      resolveFirst = resolve;
    });
    const last30 = summary({ start: "2026-10-23", end: "2026-11-21", days_count: 30 });
    invoke.mockImplementationOnce(() => first).mockImplementation(() => Promise.resolve(last30));
    await renderPage();

    await act(async () => {
      fireEvent.click(screen.getByRole("radio", { name: "近 30 天" }));
    });
    expect(lastStatisticsCall()).toEqual([
      "get_statistics_summary",
      { start: "2026-10-23", end: "2026-11-21", includeHidden: false },
    ]);
    expect(screen.getByText(/2026-10-23 至 11-21/)).toBeInTheDocument();

    await act(async () => {
      resolveFirst(summary());
    });
    expect(screen.getByText(/2026-10-23 至 11-21/)).toBeInTheDocument();
    expect(screen.queryByText(/2026-11-15 至 11-21/)).not.toBeInTheDocument();
  });

  it("marks the previous range's panels as busy while a new range loads", async () => {
    let resolveYear!: (value: StatisticsSummary) => void;
    invoke
      .mockResolvedValueOnce(summary())
      .mockImplementationOnce(
        () =>
          new Promise<StatisticsSummary>((resolve) => {
            resolveYear = resolve;
          }),
      );
    await renderPage();
    const results = document.querySelector(".stats-results");
    expect(results).toHaveAttribute("aria-busy", "false");

    await act(async () => {
      fireEvent.click(screen.getByRole("radio", { name: "今年" }));
    });
    const [, request] = lastStatisticsCall();
    expect(screen.getByRole("status")).toHaveTextContent(`正在读取 ${request.start} 至 11-21…`);
    expect(document.querySelector(".stats-results")).toHaveAttribute("aria-busy", "true");
    expect(screen.queryByText(/2026-11-15 至 11-21/)).not.toBeInTheDocument();

    await act(async () => {
      resolveYear(summary({ start: request.start, end: "2026-11-21" }));
    });
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(document.querySelector(".stats-results")).toHaveAttribute("aria-busy", "false");
    expect(screen.getByText(new RegExp(`${request.start} 至 11-21`))).toBeInTheDocument();
  });

  it("drops the previous range's panels when the new range cannot be read", async () => {
    invoke.mockResolvedValueOnce(summary()).mockRejectedValueOnce(new Error("boom"));
    await renderPage();
    expect(screen.getByRole("region", { name: "每日趋势" })).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole("radio", { name: "今年" }));
    });
    expect(screen.getByRole("alert")).toHaveTextContent("无法读取统计");
    expect(screen.queryByRole("region", { name: "每日趋势" })).not.toBeInTheDocument();
    expect(screen.queryByText(/2026-11-15 至 11-21/)).not.toBeInTheDocument();
  });

  describe("per-day labels under the recorder", () => {
    const clientWidth = Object.getOwnPropertyDescriptor(Element.prototype, "clientWidth");
    let paperWidth = 855;

    beforeEach(() => {
      vi.stubGlobal(
        "ResizeObserver",
        class {
          observe() {}
          disconnect() {}
        },
      );
      Object.defineProperty(Element.prototype, "clientWidth", {
        configurable: true,
        get(this: Element) {
          return this.classList.contains("paper") ? paperWidth : 0;
        },
      });
    });

    afterEach(() => {
      vi.unstubAllGlobals();
      if (clientWidth) Object.defineProperty(Element.prototype, "clientWidth", clientWidth);
    });

    // 11-12..11-21: 10 days of 20 h recorded, 12.6 h active.
    const tenDays = () =>
      summary({
        start: "2026-11-12",
        days_count: 10,
        days: Array.from({ length: 10 }, (_, index) => day(`2026-11-${12 + index}`, 20 * H, 12.6 * H)),
      });

    function chart() {
      return screen.getByRole("img", { name: /每日趋势/ });
    }

    it("labels every day of a short range when the columns are wide enough", async () => {
      paperWidth = 1100;
      invoke.mockResolvedValue(summary());
      await renderPage();

      expect(chart().querySelectorAll(".vals-strong")).toHaveLength(5);
      expect(chart()).toHaveTextContent("11-21 周六（今天）");
      expect(chart()).toHaveTextContent("活跃 5.0小时");
    });

    function dayLabels() {
      return Array.from(chart().querySelectorAll("text.day"), (node) => node.textContent);
    }

    it("drops the value prefixes to the gutter when full labels are too wide at the minimum window width", async () => {
      paperWidth = 855;
      invoke.mockResolvedValue(tenDays());
      await renderPage();

      expect(dayLabels()).toHaveLength(10);
      expect(dayLabels()[0]).toBe("11-12 周四");
      expect(dayLabels()[9]).toBe("今天");
      expect(chart().querySelectorAll(".vals-strong")).toHaveLength(10);
      expect(chart()).toHaveTextContent("12.6小时");
      expect(chart()).not.toHaveTextContent("活跃 12.6小时");
      // One 活跃 / 记录 row header each, in the left gutter.
      expect(Array.from(chart().querySelectorAll(".vals-dim"), (node) => node.textContent)).toEqual(
        expect.arrayContaining(["活跃", "记录"]),
      );
    });

    it("keeps every day labelled when hours-minutes values are too long for 7 columns", async () => {
      paperWidth = 855;
      invoke.mockResolvedValue(
        summary({ days: summary().days.map((item) => day(item.date, 23 * H, 12.6 * H)) }),
      );
      await renderPage({ durationFormat: "hours_minutes" });
      expect(dayLabels()).toEqual([
        "11-15 周日",
        "11-16 周一",
        "11-17 周二",
        "11-18 周三",
        "11-19 周四",
        "11-20 周五",
        "今天",
      ]);
      expect(chart().querySelectorAll(".vals-strong")).toHaveLength(7);
      expect(chart()).toHaveTextContent("12小时36分钟");
      cleanup();

      invoke.mockReset();
      invoke.mockResolvedValue(
        summary({ days: summary().days.map((item) => day(item.date, 23 * H, 12.6 * H)) }),
      );
      await renderPage();
      expect(chart()).toHaveTextContent("活跃 12.6小时");
      expect(chart().querySelectorAll(".vals-strong")).toHaveLength(7);
    });

    it("keeps only the day lines of a 10-day range when even short values do not fit", async () => {
      paperWidth = 855;
      invoke.mockResolvedValue(tenDays());
      await renderPage({ durationFormat: "hours_minutes" });

      expect(dayLabels()).toHaveLength(10);
      expect(dayLabels()[9]).toBe("今天");
      expect(chart().querySelectorAll(".vals")).toHaveLength(0);
      expect(chart().querySelectorAll(".pen-lamp")).toHaveLength(1);
    });

    it("falls back to sparse labels when a 10-day range is too narrow for the day lines", async () => {
      paperWidth = 600;
      invoke.mockResolvedValue(tenDays());
      await renderPage();

      expect(chart().querySelectorAll(".vals")).toHaveLength(0);
      expect(dayLabels()).toEqual(["11-12", "11-16", "今天"]);
    });

    // Every day from `start` to `end` inclusive, each with 8 h recorded.
    function longRange(start: string, end: string): StatisticsSummary {
      const days: StatisticsDay[] = [];
      for (let at = Date.parse(`${start}T00:00:00Z`); at <= Date.parse(`${end}T00:00:00Z`); at += 86400000) {
        days.push(day(new Date(at).toISOString().slice(0, 10), 8 * H, 4 * H));
      }
      return summary({ start, end, days_count: days.length, days });
    }

    it("drops month labels that would collide with the first or last label of a long range", async () => {
      paperWidth = 1080;
      // 304 days: 02-01 is 10 columns (about 32 px) after 01-22, too close to its label.
      invoke.mockResolvedValue(longRange("2026-01-22", "2026-11-21"));
      await renderPage();
      expect(dayLabels()).toEqual(["01-22", "3月", "4月", "5月", "6月", "7月", "8月", "9月", "10月", "11月", "今天"]);
      cleanup();

      // 293 days: 11-01 is 10 columns before the last label 11-10.
      invoke.mockReset();
      invoke.mockResolvedValue(longRange("2026-01-22", "2026-11-10"));
      await renderPage();
      expect(dayLabels()).toEqual(["01-22", "3月", "4月", "5月", "6月", "7月", "8月", "9月", "10月", "11-10"]);
    });
  });

  it("keeps the year on caption dates outside the selected range's year", async () => {
    invoke.mockResolvedValue(summary());
    await renderPage();
    expect(screen.getByText(/2026-11-15 至 11-21/)).toHaveTextContent("对比 11-08 至 11-14");
    cleanup();

    invoke.mockReset();
    invoke.mockResolvedValue(
      summary({ start: "2027-01-01", end: "2027-03-01", system_comparison_available: false }),
    );
    await renderPage();
    expect(screen.getByText(/2027-01-01 至 03-01/)).toHaveTextContent("数据从 2026-05-29 开始，没有对比区间");
    cleanup();

    invoke.mockReset();
    invoke.mockResolvedValue(
      summary({
        start: "2027-01-01",
        end: "2027-01-07",
        previous_start: "2026-12-25",
        previous_end: "2026-12-31",
      }),
    );
    await renderPage();
    expect(screen.getByText(/2027-01-01 至 01-07/)).toHaveTextContent("对比 2026-12-25 至 12-31");
  });

  it("shows the loading, error and empty states", async () => {
    invoke.mockImplementation(() => new Promise(() => {}));
    await renderPage();
    expect(screen.getByRole("status")).toHaveTextContent("正在读取统计…");
    cleanup();

    invoke.mockReset();
    invoke.mockRejectedValue(new Error("boom"));
    await renderPage();
    expect(screen.getByRole("alert")).toHaveTextContent("无法读取统计");
    cleanup();

    invoke.mockReset();
    invoke.mockResolvedValue(
      summary({
        days: summary().days.map((item) => day(item.date, 0, 0)),
        ranking: [],
        idle_open: [],
        sessions: [],
      }),
    );
    await renderPage();
    expect(screen.getByText("这段时间没有记录")).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: /每日趋势/ })).not.toBeInTheDocument();
  });

  it("shows range totals, the daily average and the change against the previous range", async () => {
    invoke.mockResolvedValue(summary());
    await renderPage();

    const trend = screen.getByRole("region", { name: "每日趋势" });
    const sums = trend.querySelectorAll(".trend-sum");
    expect(sums[0]).toHaveTextContent("记录100.0小时比上期 -20%");
    expect(sums[1]).toHaveTextContent("活跃25.0小时比上期 +25%");
    expect(sums[2]).toHaveTextContent("活跃率25%");
    expect(trend).toHaveTextContent("日均活跃 3.6小时");

    const chart = within(trend).getByRole("img", { name: /每日趋势/ });
    expect(chart.getAttribute("aria-label")).toContain("记录 100.0小时");
    const table = within(trend).getByRole("table", { name: "逐日记录与活跃" });
    expect(within(table).getAllByRole("row")).toHaveLength(8);
    expect(within(table).getByRole("row", { name: /2026-11-17/ })).toHaveTextContent("20.0小时5.0小时25%");
  });

  it("says 无对比 instead of 0% when the previous range is not comparable", async () => {
    invoke.mockResolvedValue(
      summary({
        system_comparison_available: false,
        software_comparison_available: false,
        previous_recorded_seconds: 0,
        previous_active_seconds: 0,
        ranking: [rankRow("Claude", 1, null)],
      }),
    );
    await renderPage();

    const trend = screen.getByRole("region", { name: "每日趋势" });
    expect(within(trend).getAllByText("无对比")).toHaveLength(2);
    expect(trend).not.toHaveTextContent("0%比上期");
    expect(trend).not.toHaveTextContent("比上期 0%");
    const ranking = screen.getByRole("region", { name: "区间排行" });
    expect(ranking).toHaveTextContent("按焦点时长 · 无对比");
    expect(within(ranking).getByText("无对比")).toBeInTheDocument();
  });

  it("states rank changes in text, not only colour", async () => {
    invoke.mockResolvedValue(summary());
    await renderPage();

    const ranking = screen.getByRole("region", { name: "区间排行" });
    expect(ranking).toHaveTextContent("按焦点时长 · 与前 7 天比");
    expect(within(ranking).getByText("上升 2 名")).toBeInTheDocument();
    expect(within(ranking).getByText("持平")).toBeInTheDocument();
    expect(within(ranking).getByText("下降 1 名")).toBeInTheDocument();
    expect(within(ranking).getByText("新上榜")).toBeInTheDocument();
  });

  it("notes days without software detail above the software ledgers", async () => {
    invoke.mockResolvedValue(summary({ days_without_software_detail: 3 }));
    await renderPage();

    expect(screen.getByText("区间内有 3 天无软件明细")).toBeInTheDocument();
    expect(screen.getByText(/2026-06-18 之前只记了总时长/)).toBeInTheDocument();
  });

  it("lists idle-open software and says so when there is none", async () => {
    invoke.mockResolvedValue(summary());
    await renderPage();
    const idle = screen.getByRole("region", { name: "开着没用" });
    expect(within(idle).getByText("微信").closest(".stats-row")).toHaveTextContent("40.0小时1.0小时 · 2.5%39.0小时");
    cleanup();

    invoke.mockReset();
    invoke.mockResolvedValue(summary({ idle_open: [] }));
    await renderPage();
    expect(screen.getByText("这段时间没有开着不用的软件")).toBeInTheDocument();
  });

  it("shows sessions and the daily rhythm", async () => {
    invoke.mockResolvedValue(summary());
    await renderPage();

    const sessions = screen.getByRole("region", { name: "会话" });
    expect(within(sessions).getByText("Microsoft Edge").closest(".stats-row")).toHaveTextContent(
      "41次0.5小时10.0小时",
    );
    const rhythm = screen.getByRole("region", { name: "作息" });
    // Weekdays 11-16..11-20: (0 + 4 × 5 h) / 5 = 4 h; weekend 11-15, 11-21: 5 h / 2 = 2.5 h.
    expect(within(rhythm).getByText("工作日日均活跃").closest(".rhythm-cell")).toHaveTextContent("4.0小时");
    expect(within(rhythm).getByText("周末日均活跃").closest(".rhythm-cell")).toHaveTextContent("2.5小时");
    expect(within(rhythm).getByText("日均开机时长").closest(".rhythm-cell")).toHaveTextContent("21.0小时");
    expect(rhythm).toHaveTextContent("有记录 5 天 / 共 7 天");
  });

  it("requests hidden software when the switch is turned on", async () => {
    invoke.mockResolvedValue(summary());
    await renderPage();

    const toggle = screen.getByRole("switch", { name: "包含隐藏软件" });
    expect(toggle).toHaveAttribute("aria-checked", "false");
    await act(async () => {
      fireEvent.click(toggle);
    });
    expect(toggle).toHaveAttribute("aria-checked", "true");
    expect(lastStatisticsCall()).toEqual([
      "get_statistics_summary",
      { start: "2026-11-15", end: "2026-11-21", includeHidden: true },
    ]);
  });

  it("validates a custom range before requesting it", async () => {
    invoke.mockResolvedValue(summary());
    await renderPage();

    await act(async () => {
      fireEvent.click(screen.getByRole("radio", { name: "自定义" }));
    });
    const start = screen.getByLabelText("开始日期");
    const end = screen.getByLabelText("结束日期");
    expect(start).toHaveAttribute("min", "2026-05-29");
    expect(end).toHaveAttribute("max", "2026-11-21");

    await act(async () => {
      fireEvent.change(start, { target: { value: "2026-11-20" } });
      fireEvent.change(end, { target: { value: "2026-11-10" } });
    });
    expect(screen.getByText("开始日期不能晚于结束日期")).toBeInTheDocument();
    const callsBefore = statisticsCalls().length;

    await act(async () => {
      fireEvent.change(start, { target: { value: "2026-11-01" } });
    });
    expect(statisticsCalls()).toHaveLength(callsBefore + 1);
    expect(lastStatisticsCall()).toEqual([
      "get_statistics_summary",
      { start: "2026-11-01", end: "2026-11-10", includeHidden: false },
    ]);
  });

  it("formats durations with the duration-format setting", async () => {
    invoke.mockResolvedValue(summary());
    await renderPage({ durationFormat: "hours_minutes" });

    const trend = screen.getByRole("region", { name: "每日趋势" });
    expect(trend.querySelector(".trend-sum")).toHaveTextContent("记录100小时");
    expect(trend).toHaveTextContent("日均活跃 3小时34分钟");
    const sessions = screen.getByRole("region", { name: "会话" });
    expect(sessions).toHaveTextContent("30分钟");
  });
});
