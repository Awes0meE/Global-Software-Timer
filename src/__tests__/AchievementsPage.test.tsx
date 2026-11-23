import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AchievementsSummary, HeatmapDay } from "../api";
import { AchievementsPage } from "../components/AchievementsPage";
import { heatLevel } from "../components/ActivityHeatmap";

const invoke = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/api/core", () => ({ invoke }));

afterEach(() => {
  cleanup();
  invoke.mockReset();
});

const H = 3600;
const TODAY = "2026-11-21";

/** `count` days ending today, all zero except the given dates. */
function heatmapDays(count: number, values: Record<string, number> = {}): HeatmapDay[] {
  const end = Date.UTC(2026, 10, 21);
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(end - (count - 1 - index) * 86_400_000).toISOString().slice(0, 10);
    return { date, active_seconds: values[date] ?? 0 };
  });
}

function summary(overrides: Partial<AchievementsSummary> = {}): AchievementsSummary {
  return {
    today: TODAY,
    heatmap_days: 90,
    // November: three used days (299 s on 11-18 is below the 5-minute filter), 3.9 hours in all.
    heatmap: heatmapDays(90, {
      "2026-10-01": 3 * H,
      "2026-11-18": 299,
      "2026-11-19": 300,
      "2026-11-20": H,
      "2026-11-21": 9720,
    }),
    streak_threshold_seconds: 300,
    current_streak_days: 3,
    current_streak_start: "2026-11-19",
    longest_streak_days: 27,
    longest_streak_start: "2026-08-23",
    longest_streak_end: "2026-09-18",
    best_active_day: { date: "2026-08-30", seconds: 12 * H },
    best_software_day: {
      identity_key: "chatgpt",
      display_name: "ChatGPT",
      icon_url: null,
      date: "2026-08-12",
      seconds: 20.4 * H,
    },
    milestone_hours: [10, 50, 100, 500, 1000, 6666],
    milestones: [
      {
        identity_key: "chatgpt",
        display_name: "ChatGPT",
        icon_url: null,
        focused_seconds: 225 * H,
        reached_hours: 100,
        reached_on: "2026-08-31",
        next_hours: 500,
      },
      {
        identity_key: "code",
        display_name: "Visual Studio Code",
        icon_url: null,
        focused_seconds: 12 * H,
        reached_hours: 10,
        reached_on: "2026-11-11",
        next_hours: 50,
      },
    ],
    new_software: [
      { identity_key: "faceit", display_name: "FACEIT", icon_url: null, date: "2026-11-19" },
    ],
    dormant_software: [
      { identity_key: "excel", display_name: "Microsoft Excel", icon_url: null, date: "2026-10-13" },
    ],
    ...overrides,
  };
}

function achievementCalls() {
  return invoke.mock.calls.filter(([command]) => command === "get_achievements_summary");
}

function monthCaption(label: string): HTMLElement {
  const month = screen.getByText(label, { selector: ".ach-month-head b" }).closest(".ach-month") as HTMLElement;
  return month.querySelector(".ach-month-caption") as HTMLElement;
}

async function renderPage(props: Parameters<typeof AchievementsPage>[0] = {}) {
  await act(async () => {
    render(<AchievementsPage {...props} />);
  });
}

describe("AchievementsPage", () => {
  it("reads the last 90 days by default and rereads when the range changes", async () => {
    invoke.mockImplementation((_command, args: { heatmapDays: number }) =>
      Promise.resolve(
        summary({ heatmap_days: args.heatmapDays, heatmap: heatmapDays(args.heatmapDays) }),
      ),
    );
    await renderPage();

    expect(invoke).toHaveBeenCalledWith("get_achievements_summary", { heatmapDays: 90, includeHidden: false });
    expect(screen.getByRole("radio", { name: "近 90 天" })).toHaveAttribute("aria-checked", "true");

    await act(async () => {
      fireEvent.click(screen.getByRole("radio", { name: "近半年" }));
    });
    expect(invoke).toHaveBeenLastCalledWith("get_achievements_summary", { heatmapDays: 180, includeHidden: false });

    await act(async () => {
      fireEvent.click(screen.getByRole("radio", { name: "近一年" }));
    });
    expect(invoke).toHaveBeenLastCalledWith("get_achievements_summary", { heatmapDays: 365, includeHidden: false });
    expect(screen.getByRole("radio", { name: "近一年" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getAllByLabelText(/^\d{4}-\d{2}-\d{2} (活跃|无记录)/)).toHaveLength(365);
    expect(screen.getByText("近一年里用过")).toBeInTheDocument();
  });

  it("ignores a slower response for the previous range", async () => {
    let resolveOld!: (value: AchievementsSummary) => void;
    invoke.mockImplementation((_command, args: { heatmapDays: number }) =>
      args.heatmapDays === 180
        ? new Promise<AchievementsSummary>((resolve) => { resolveOld = resolve; })
        : Promise.resolve(summary({ heatmap_days: args.heatmapDays, heatmap: heatmapDays(args.heatmapDays) })),
    );
    await renderPage();
    await act(async () => {
      fireEvent.click(screen.getByRole("radio", { name: "近半年" }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("radio", { name: "近一年" }));
    });
    await act(async () => {
      resolveOld(summary({ heatmap_days: 180, heatmap: heatmapDays(180) }));
    });

    expect(screen.getAllByLabelText(/^\d{4}-\d{2}-\d{2} (活跃|无记录)/)).toHaveLength(365);
  });

  it("shows loading and error states", async () => {
    invoke.mockReturnValue(new Promise(() => {}));
    const view = render(<AchievementsPage />);
    expect(screen.getByRole("status")).toHaveTextContent("正在读取成就…");
    view.unmount();

    invoke.mockRejectedValue(new Error("locked"));
    await renderPage();
    expect(screen.getByRole("alert")).toHaveTextContent("无法读取成就");
  });

  it("draws one labelled cell per heatmap day inside an image with a data table", async () => {
    invoke.mockResolvedValue(summary());
    await renderPage();

    const cells = screen.getAllByLabelText(/^\d{4}-\d{2}-\d{2} 活跃/);
    expect(cells).toHaveLength(90);
    expect(screen.getByLabelText("2026-10-01 活跃 3.0小时")).toHaveAttribute("data-level", "3");
    expect(screen.getByLabelText("2026-11-21 活跃 2.7小时")).toHaveAttribute("data-level", "2");
    expect(screen.getByLabelText("2026-11-21 活跃 2.7小时")).toHaveClass("is-today");
    expect(screen.getByLabelText("2026-11-20 活跃 1.0小时")).toHaveAttribute("data-level", "2");
    expect(screen.getByLabelText("2026-11-19 活跃 0.1小时")).toHaveAttribute("data-level", "1");
    expect(screen.getByLabelText("2026-11-18 活跃 0.1小时")).toHaveAttribute("data-level", "0");

    const chart = screen.getByRole("img", { name: /活跃热力图/ });
    expect(chart).toHaveAccessibleName(/2026-08-24 至 2026-11-21/);
    expect(chart).toHaveAccessibleName(/用过 4 天/);
    const table = screen.getByRole("table", { name: /逐日活跃/ });
    expect(within(table).getAllByRole("row")).toHaveLength(91);
  });

  it("draws days before local records began as 无记录, not as unused days", async () => {
    // Records start on 05-29: the longest streak and best day are the earliest known dates.
    invoke.mockResolvedValue(
      summary({
        heatmap_days: 365,
        heatmap: heatmapDays(365, { "2026-05-29": 600, "2026-06-02": 2 * H }),
        longest_streak_start: "2026-05-29",
        longest_streak_end: "2026-05-29",
        best_active_day: { date: "2026-06-02", seconds: 2 * H },
      }),
    );
    await renderPage();

    expect(screen.getByLabelText("2026-05-28 无记录")).toHaveClass("is-norecord");
    expect(screen.getByLabelText("2025-11-22 无记录")).toHaveClass("is-norecord");
    expect(screen.getByLabelText("2026-05-29 活跃 0.2小时")).toHaveAttribute("data-level", "1");
    expect(screen.getByLabelText("2026-05-30 活跃 0.0小时")).toHaveAttribute("data-level", "0");

    const heatmap = screen.getByRole("region", { name: "活跃热力图" });
    expect(heatmap.querySelector(".ach-legend")).toHaveTextContent("未到无记录");
    // Months with no records carry no 用过 caption; May counts only its recorded days.
    const april = within(heatmap).getByText("4月").closest(".ach-month") as HTMLElement;
    expect(april).not.toHaveTextContent("用过");
    const may = within(heatmap).getByText("5月").closest(".ach-month") as HTMLElement;
    expect(may).toHaveTextContent("用过 1 天");
    expect(screen.getByRole("img", { name: /活跃热力图/ })).toHaveAccessibleName(/2026-05-29 之前无记录/);
    const table = screen.getByRole("table", { name: /逐日活跃/ });
    expect(within(table).getByRole("row", { name: /2026-05-28/ })).toHaveTextContent("无记录");
  });

  it("draws every day as 无记录 when nothing has been recorded", async () => {
    invoke.mockResolvedValue(
      summary({
        heatmap: heatmapDays(90),
        current_streak_days: 0,
        current_streak_start: null,
        longest_streak_days: 0,
        longest_streak_start: null,
        longest_streak_end: null,
        best_active_day: null,
        best_software_day: null,
        milestones: [],
        new_software: [],
        dormant_software: [],
      }),
    );
    await renderPage();

    expect(screen.getAllByLabelText(/^\d{4}-\d{2}-\d{2} 无记录$/)).toHaveLength(90);
    expect(screen.queryByText(/^用过 \d+ 天/)).not.toBeInTheDocument();
    expect(screen.getByRole("img", { name: /活跃热力图/ })).toHaveAccessibleName(/还没有记录/);
  });

  it("keeps normal-size cells for 近半年 and wraps its months into two rows", async () => {
    invoke.mockResolvedValue(summary({ heatmap_days: 180, heatmap: heatmapDays(180) }));
    await renderPage();

    const dial = document.querySelector(".lcd.ach-dial") as HTMLElement;
    expect(dial).not.toHaveClass("is-compact");
    const months = dial.querySelectorAll(".ach-month");
    expect(months).toHaveLength(7);
    expect(dial.querySelectorAll(".ach-month.is-wrapped")).toHaveLength(3);
  });

  it("buckets days below the filter, under 1 hour, under 3 hours and from 3 hours", () => {
    expect(heatLevel(0, 300)).toBe(0);
    expect(heatLevel(299, 300)).toBe(0);
    expect(heatLevel(300, 300)).toBe(1);
    expect(heatLevel(H - 1, 300)).toBe(1);
    expect(heatLevel(H, 300)).toBe(2);
    expect(heatLevel(3 * H - 1, 300)).toBe(2);
    expect(heatLevel(3 * H, 300)).toBe(3);
  });

  it("writes streaks and totals as a record, never as a target", async () => {
    invoke.mockResolvedValue(summary({ streak_threshold_seconds: 600 }));
    await renderPage();

    const heatmap = screen.getByRole("region", { name: "活跃热力图" });
    expect(within(heatmap).getByText("当前连续")).toBeInTheDocument();
    expect(within(heatmap).getByText("最长连续")).toBeInTheDocument();
    expect(within(heatmap).getByText("27")).toBeInTheDocument();
    expect(within(heatmap).getByText("08-23 至 09-18")).toBeInTheDocument();
    expect(within(heatmap).getByText("11-19 至今天")).toBeInTheDocument();
    expect(heatmap).toHaveTextContent("活跃不到 10 分钟的日子不算在内，免得开机看一眼也被记上");
    const legend = heatmap.querySelector(".ach-legend") as HTMLElement;
    expect(legend).toHaveTextContent("没用<1小时<3小时≥3小时未到");
    expect(within(heatmap).getByText("近 90 天里用过")).toBeInTheDocument();
    expect(within(heatmap).getByText("11月")).toBeInTheDocument();

    const text = document.body.textContent ?? "";
    expect(text).not.toContain("达标");
    expect(text).not.toContain("还差");
    expect(text).not.toContain("保持连续");
    expect(text).not.toContain("倒计时");
  });

  it("captions each month with its used days and active time", async () => {
    invoke.mockResolvedValue(summary());
    await renderPage();

    // 11-18 has 299 s, below the 5-minute filter, so November has three used days. The caption is
    // two unbreakable parts so a narrow month wraps between them; the "·" is drawn by CSS.
    const november = monthCaption("11月");
    expect([...november.children].map((part) => part.textContent)).toEqual(["用过 3 天", "3.9小时"]);
    expect(monthCaption("10月")).toHaveTextContent(/^用过 1 天3\.0小时$/);
    expect(screen.getByTitle("2026-11 用过 3 天 · 3.9小时")).toBeInTheDocument();
    expect(screen.getByText("近 90 天里用过").nextElementSibling).toHaveTextContent("4天");
  });

  it("shows reached milestones with their unlock date and progress to the next tier", async () => {
    invoke.mockResolvedValue(summary());
    await renderPage();

    const shelf = screen.getByRole("region", { name: "里程碑" });
    const plate100 = within(shelf).getByRole("group", { name: "100 小时" });
    expect(within(plate100).getByText("ChatGPT")).toBeInTheDocument();
    expect(within(plate100).getByText("08-31")).toBeInTheDocument();
    const plate10 = within(shelf).getByRole("group", { name: "10 小时" });
    expect(within(plate10).getByText("Visual Studio Code")).toBeInTheDocument();
    expect(within(plate10).getByText("11-11")).toBeInTheDocument();

    const plate500 = within(shelf).getByRole("group", { name: "500 小时" });
    expect(plate500).toHaveClass("is-slot");
    expect(within(plate500).getByText("未点亮")).toBeInTheDocument();
    expect(within(plate500).getByText("45%")).toBeInTheDocument();
    expect(within(plate500).getByText("225.0小时 / 500小时")).toBeInTheDocument();

    const ultimate = within(shelf).getByRole("group", { name: "6666 小时" });
    expect(within(ultimate).getByText("终极成就")).toBeInTheDocument();
    expect(ultimate).toHaveClass("is-slot");
    expect(ultimate).not.toHaveClass("is-ultimate");
    expect(within(shelf).getByText(/已点亮 3 \/ 6 档/)).toBeInTheDocument();
  });

  it("outlines the 6666-hour plate only once it is reached", async () => {
    invoke.mockResolvedValue(
      summary({
        milestones: [
          {
            identity_key: "x",
            display_name: "Long Runner",
            icon_url: null,
            focused_seconds: 6700 * H,
            reached_hours: 6666,
            reached_on: "2026-11-01",
            next_hours: null,
          },
        ],
      }),
    );
    await renderPage();

    const ultimate = screen.getByRole("group", { name: "6666 小时" });
    expect(ultimate).toHaveClass("is-reached", "is-ultimate");
    expect(within(ultimate).getByText("Long Runner")).toBeInTheDocument();
    expect(within(ultimate).getByText("终极成就")).toBeInTheDocument();
  });

  // Spec 迁移表「里程碑铭牌」: glass sub-plates without screws.
  it("draws reached milestone plates without screws", async () => {
    invoke.mockResolvedValue(summary());
    await renderPage();

    expect(document.querySelectorAll(".ach-plate.is-reached").length).toBeGreaterThan(0);
    expect(document.querySelectorAll(".ach-screw")).toHaveLength(0);
  });

  it("shows personal records and comings and goings", async () => {
    invoke.mockResolvedValue(summary());
    await renderPage();

    const records = screen.getByRole("region", { name: "个人纪录" });
    expect(within(records).getByText("2026-08-30")).toBeInTheDocument();
    expect(within(records).getByText("12.0")).toBeInTheDocument();
    expect(within(records).getByText("20.4")).toBeInTheDocument();

    const comings = screen.getByRole("region", { name: "软件来去" });
    expect(within(comings).getByText("FACEIT")).toBeInTheDocument();
    expect(within(comings).getByText("Microsoft Excel")).toBeInTheDocument();
  });

  it("shows empty copy for comings and goings and rereads with hidden software", async () => {
    invoke.mockResolvedValue(summary({ new_software: [], dormant_software: [] }));
    await renderPage();

    const comings = screen.getByRole("region", { name: "软件来去" });
    expect(within(comings).getByText("近 30 天没有新出现的软件")).toBeInTheDocument();
    expect(within(comings).getByText("没有 30 天未打开的软件")).toBeInTheDocument();

    const toggle = screen.getByRole("switch", { name: "包含隐藏软件" });
    expect(toggle).toHaveAttribute("aria-checked", "false");
    await act(async () => {
      fireEvent.click(toggle);
    });
    expect(invoke).toHaveBeenLastCalledWith("get_achievements_summary", { heatmapDays: 90, includeHidden: true });
    expect(screen.getByRole("switch", { name: "包含隐藏软件" })).toHaveAttribute("aria-checked", "true");
    expect(achievementCalls()).toHaveLength(2);
  });

  it("follows the duration format setting", async () => {
    invoke.mockResolvedValue(summary());
    await renderPage({ durationFormat: "hours_minutes" });

    expect(screen.getByLabelText("2026-11-21 活跃 2小时42分钟")).toBeInTheDocument();
    expect(monthCaption("11月")).toHaveTextContent(/^用过 3 天3小时51分钟$/);
    expect(screen.getByText("225小时 / 500小时")).toBeInTheDocument();
  });
});
