import { describe, expect, it } from "vitest";
import type { AppUsageRow, DashboardSummary } from "../api";
import { trayColumnCentres } from "../posters/DailyPoster";
import {
  achievementPosterModel,
  dailyPosterModel,
  formatPosterDay,
  formatPosterFullDate,
  formatPosterHours,
  topDailySoftware,
  withIcons,
  type MilestoneSoftware,
} from "../posters/models";

const H = 3600;

function app(id: number, name: string, runtime: number, active: number, icon: string | null = `icon-${id}`): AppUsageRow {
  return {
    app_id: id,
    display_name: name,
    process_name: `${name}.exe`,
    icon_url: icon,
    total_seconds: 100 * H,
    today_seconds: runtime,
    active_today_seconds: active,
    status: "closed",
    is_running: false,
  };
}

function summary(apps: AppUsageRow[], recorded = 9.6 * H, active = 6.3 * H): DashboardSummary {
  return {
    last_scan_succeeded: true,
    product_title: "全局软件计时器",
    locale: "zh-CN",
    usage_date: "2026-11-25",
    is_today: true,
    most_used: null,
    recorded_today_seconds: recorded,
    active_today_seconds: active,
    apps,
  };
}

const demoApps = [
  app(1, "Visual Studio Code", 5.4 * H, 2.4 * H),
  app(2, "Google Chrome", 4.1 * H, 1.5 * H),
  app(3, "微信", 6.2 * H, 0.4 * H),
  app(4, "Microsoft Excel", 1.8 * H, 0.7 * H),
];

describe("dailyPosterModel", () => {
  it("labels today and a past day", () => {
    expect(dailyPosterModel(summary(demoApps), "2026-11-25", true)).toMatchObject({
      dateText: "11月25日 周三",
      label: "今日活跃",
    });
    expect(dailyPosterModel(summary(demoApps), "2026-11-22", false)).toMatchObject({
      dateText: "11月22日 周日",
      label: "当日活跃",
    });
  });

  it("shows active and recorded hours with one decimal and the active share on the bar", () => {
    const model = dailyPosterModel(summary(demoApps), "2026-11-25", true);
    expect(model.hero).toBe("6.3");
    expect(model.recorded).toBe("9.6");
    expect(model.share).toBeCloseTo(6.3 / 9.6, 6);
  });

  it("clamps the bar share and leaves it empty when nothing was recorded", () => {
    expect(dailyPosterModel(summary(demoApps, 2 * H, 3 * H), "2026-11-25", true).share).toBe(1);
    expect(dailyPosterModel(summary([], 0, 0), "2026-11-25", true)).toMatchObject({
      share: 0,
      hero: "0.0",
      recorded: "0.0",
      columns: [],
    });
  });

  it("takes the top 3 by active time with their icons and active hours", () => {
    const { columns } = dailyPosterModel(summary(demoApps), "2026-11-25", true);
    expect(columns).toEqual([
      { key: "1", name: "Visual Studio Code", icon: "icon-1", hours: "2.4" },
      { key: "2", name: "Google Chrome", icon: "icon-2", hours: "1.5" },
      { key: "4", name: "Microsoft Excel", icon: "icon-4", hours: "0.7" },
    ]);
  });

  it("only uses the rows the overview lists (the backend already left hidden software out)", () => {
    const { columns } = dailyPosterModel(summary([demoApps[2]]), "2026-11-25", true);
    expect(columns.map((column) => column.name)).toEqual(["微信"]);
  });
});

describe("topDailySoftware", () => {
  it("breaks active ties by runtime, then by name", () => {
    const rows = [app(1, "B", 2 * H, H), app(2, "A", 2 * H, H), app(3, "C", 3 * H, H)];
    expect(topDailySoftware(rows).map((column) => column.name)).toEqual(["C", "A", "B"]);
  });

  it("falls back to runtime when nothing had active time", () => {
    const rows = [app(1, "Steam", 0.4 * H, 0), app(2, "OneDrive", 6 * H, 0)];
    expect(topDailySoftware(rows)).toEqual([
      { key: "2", name: "OneDrive", icon: "icon-2", hours: "6.0" },
      { key: "1", name: "Steam", icon: "icon-1", hours: "0.4" },
    ]);
  });

  it("gives 0, 1, 2 or 3 columns and skips software with no time that day", () => {
    expect(topDailySoftware([])).toEqual([]);
    expect(topDailySoftware([app(1, "A", 0, 0)])).toEqual([]);
    expect(topDailySoftware([app(1, "A", H, H), app(2, "B", 0, 0)])).toHaveLength(1);
    expect(topDailySoftware([app(1, "A", H, H), app(2, "B", H, 0)])).toHaveLength(2);
    expect(topDailySoftware(demoApps)).toHaveLength(3);
  });
});

describe("tray columns", () => {
  it("centres 1 to 3 columns 140 px apart", () => {
    expect(trayColumnCentres(0)).toEqual([]);
    expect(trayColumnCentres(1)).toEqual([270]);
    expect(trayColumnCentres(2)).toEqual([200, 340]);
    expect(trayColumnCentres(3)).toEqual([130, 270, 410]);
  });
});

describe("poster formatting", () => {
  it("formats days, full dates and hours", () => {
    expect(formatPosterDay("2026-01-05")).toBe("1月5日 周一");
    expect(formatPosterFullDate("2026-11-20")).toBe("2026年11月20日");
    expect(formatPosterFullDate("2026-03-08")).toBe("2026年3月8日");
    expect(formatPosterHours(6702.4 * H)).toBe("6702.4");
    expect(formatPosterHours(0.05 * H)).toBe("0.1");
    expect(formatPosterHours(-5)).toBe("0.0");
  });

  it("rejects a malformed date", () => {
    expect(() => formatPosterDay("2026-11-5")).toThrow();
  });
});

describe("achievementPosterModel", () => {
  const code: MilestoneSoftware = {
    identity_key: "code",
    display_name: "Visual Studio Code",
    process_name: "Code.exe",
    icon_url: "gsticon://code",
    tier_hours: 6666,
    reached_on: "2026-11-20",
    total_focused_seconds: Math.round(6702.4 * H),
    used_days: 1046,
  };

  it("maps the tier, the reached date and the two facts", () => {
    expect(achievementPosterModel(code)).toEqual({
      key: "code",
      name: "Visual Studio Code",
      icon: "gsticon://code",
      dateText: "2026年11月20日",
      tier: "6666",
      days: "1046",
      focus: "6702.4",
    });
  });

  it("never carries the process name", () => {
    expect(JSON.stringify(achievementPosterModel(code))).not.toContain("Code.exe");
  });
});

describe("withIcons", () => {
  it("swaps icon URLs for data URLs and leaves missing icons null", async () => {
    const items = [
      { icon: "a", name: "A" },
      { icon: null, name: "B" },
      { icon: "bad", name: "C" },
    ];
    const result = await withIcons(items, async (url) => (url === "a" ? "data:image/png;base64,AA" : null));
    expect(result.map((item) => item.icon)).toEqual(["data:image/png;base64,AA", null, null]);
  });
});
