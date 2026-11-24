import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { LcdDial } from "../components/LcdDial";
import { allRules } from "./support/css";

afterEach(cleanup);

function renderDial(now: Date, recordedSeconds = 0, activeSeconds = 0) {
  return render(<LcdDial recordedSeconds={recordedSeconds} activeSeconds={activeSeconds} now={now} />);
}

describe("LcdDial ticks", () => {
  it("draws 96 quarter-hour ticks, 24 of them hour ticks", () => {
    const { container } = renderDial(new Date(2026, 10, 21, 12, 0, 0));

    expect(container.querySelectorAll(".lcd-tick")).toHaveLength(96);
    expect(container.querySelectorAll(".lcd-tick.is-hour")).toHaveLength(24);
  });

  it("runs ticks out from radius 81, quarter ticks to 89 and hour ticks to 91 (取舍 2)", () => {
    const { container } = renderDial(new Date(2026, 10, 21, 12, 0, 0));
    const ticks = container.querySelectorAll(".lcd-tick");
    const coords = (index: number) => ["x1", "y1", "x2", "y2"].map((name) => ticks[index].getAttribute(name));
    const radius = (x: string | null, y: string | null) => Math.hypot(Number(x) - 92, Number(y) - 92);

    expect(coords(0)).toEqual(["92.00", "11.00", "92.00", "1.00"]);
    expect(coords(24)).toEqual(["173.00", "92.00", "183.00", "92.00"]);

    const [x1, y1, x2, y2] = coords(1);
    expect(ticks[1].classList.contains("is-hour")).toBe(false);
    expect(radius(x1, y1)).toBeCloseTo(81, 1);
    expect(radius(x2, y2)).toBeCloseTo(89, 1);
    expect((Math.atan2(Number(x2) - 92, 92 - Number(y2)) * 180) / Math.PI).toBeCloseTo(3.75, 1);
  });

  it("inks the ticks the day has already passed, in whole minutes", () => {
    const noon = renderDial(new Date(2026, 10, 21, 12, 0, 0)).container;
    expect(noon.querySelectorAll(".lcd-tick.is-past")).toHaveLength(48);
    expect(noon.querySelectorAll(".lcd-tick.is-hour.is-past")).toHaveLength(12);
    cleanup();

    const justAfterMidnight = renderDial(new Date(2026, 10, 21, 0, 0, 30)).container;
    expect(justAfterMidnight.querySelectorAll(".lcd-tick.is-past")).toHaveLength(0);
    cleanup();

    const quarterPast = renderDial(new Date(2026, 10, 21, 0, 15, 0)).container;
    expect(quarterPast.querySelectorAll(".lcd-tick.is-past")).toHaveLength(1);
    cleanup();

    const lastMinute = renderDial(new Date(2026, 10, 21, 23, 59, 0)).container;
    expect(lastMinute.querySelectorAll(".lcd-tick.is-past")).toHaveLength(96);
  });

  it("keeps the two 48-segment capacity rings", () => {
    const { container } = renderDial(new Date(2026, 10, 21, 12, 0, 0), 8 * 3600 + 47 * 60, 0);

    expect(container.querySelectorAll(".lcd-ring-recorded path")).toHaveLength(48);
    expect(container.querySelectorAll(".lcd-ring-active path")).toHaveLength(48);
    expect(container.querySelectorAll(".lcd-ring-recorded path.is-lit")).toHaveLength(17);
  });

  it("keeps the accessible name and hides the ticks inside the decorative svg", () => {
    const { container } = renderDial(new Date(2026, 10, 21, 12, 0, 0));

    expect(screen.getByRole("figure", { name: "满圈 24 小时，今日已过 12:00" })).toBeTruthy();
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("aria-hidden")).toBe("true");
    for (const tick of container.querySelectorAll(".lcd-tick")) {
      expect(svg?.contains(tick)).toBe(true);
    }
  });

  it("marks the ticks within ±5° (20 minutes) of the pointer so they yield to it (P-b)", () => {
    const nearAt = (hours: number, minutes: number) => {
      const { container } = renderDial(new Date(2026, 10, 22, hours, minutes, 0));
      const ticks = [...container.querySelectorAll(".lcd-tick")];
      const near = ticks.flatMap((tick, index) => (tick.classList.contains("is-near-now") ? [index] : []));
      const past = container.querySelectorAll(".lcd-tick.is-past").length;
      const pastNear = container.querySelectorAll(".lcd-tick.is-past.is-near-now").length;
      cleanup();
      return { near, past, pastNear, total: ticks.length };
    };

    expect(nearAt(22, 1)).toEqual({ near: [87, 88, 89], past: 89, pastNear: 2, total: 96 });
    expect(nearAt(22, 8)).toEqual({ near: [88, 89], past: 89, pastNear: 1, total: 96 });
    // 22:19: the 22:00 hour tick is 4.75° away and still yields (±4.5° left it ~0.5px from the pointer).
    expect(nearAt(22, 19)).toEqual({ near: [88, 89, 90], past: 90, pastNear: 2, total: 96 });
    expect(nearAt(22, 21).near).toEqual([89, 90]);
    expect(nearAt(6, 7)).toEqual({ near: [24, 25], past: 25, pastNear: 1, total: 96 });
    expect(nearAt(12, 2)).toEqual({ near: [47, 48, 49], past: 49, pastNear: 2, total: 96 });
    // Wraps around midnight both ways.
    expect(nearAt(0, 0)).toEqual({ near: [0, 1, 95], past: 0, pastNear: 0, total: 96 });
    expect(nearAt(23, 59)).toEqual({ near: [0, 1, 95], past: 96, pastNear: 3, total: 96 });
  });

  it("never lets more than 3 ticks yield and keeps 24 hour ticks, across the first and last hour", () => {
    // The pattern repeats every 15 minutes; the first and last hour also cover the midnight wrap.
    const minutes = Array.from({ length: 60 }, (_, index) => [index, 23 * 60 + index]).flat();
    for (const minute of minutes) {
      const { container } = renderDial(new Date(2026, 10, 22, Math.floor(minute / 60), minute % 60, 0));
      const near = container.querySelectorAll(".lcd-tick.is-near-now").length;
      expect(near, String(minute)).toBeGreaterThanOrEqual(2);
      expect(near, String(minute)).toBeLessThanOrEqual(3);
      expect(container.querySelectorAll(".lcd-tick.is-hour")).toHaveLength(24);
      cleanup();
    }
  });

  // v0.4.2 decision H: a past day has passed whole.
  it("inks every tick of a past day, draws no pointer and names the day in the centre", () => {
    const { container } = render(
      <LcdDial recordedSeconds={3600} activeSeconds={0} now={new Date(2026, 10, 24, 9, 30, 0)} pastDay="2026-11-17" />,
    );

    expect(container.querySelectorAll(".lcd-tick.is-past")).toHaveLength(96);
    expect(container.querySelectorAll(".lcd-tick.is-near-now")).toHaveLength(0);
    expect(container.querySelector(".lcd-dial-now")).toBeNull();
    expect(screen.getByRole("figure", { name: "满圈 24 小时" })).toBeTruthy();
    const caption = container.querySelector("figcaption");
    expect(caption?.querySelector("span")).toHaveTextContent(/^周二$/);
    expect(caption?.querySelector("strong")).toHaveTextContent(/^17日$/);
    expect(container).not.toHaveTextContent(/今日已过|09:30/);
  });

  it("draws the pointer last, over the ticks", () => {
    const { container } = renderDial(new Date(2026, 10, 21, 12, 0, 0));
    const svg = container.querySelector("svg");

    expect(svg?.lastElementChild?.classList.contains("lcd-dial-now")).toBe(true);
  });
});

/** Declarations of every top-level rule that lists `selector`, merged in source order. */
function topLevel(selector: string): Record<string, string> {
  return Object.assign(
    {},
    ...allRules()
      .filter((rule) => rule.atRules.length === 0 && rule.selectors.includes(selector))
      .map((rule) => rule.declarations),
  );
}

describe("LcdDial ink (spec 表盘墨色规则)", () => {
  it("inks the rings, ticks, pointer and midnight mark with the e-ink tokens", () => {
    expect(topLevel(".lcd-ring path").fill).toBe("var(--eink-track)");
    expect(topLevel(".lcd-ring-recorded path.is-lit").fill).toBe("var(--eink-ink)");
    expect(topLevel(".lcd-ring-active path.is-lit").fill).toBe("var(--eink-mid)");
    expect(topLevel(".lcd-tick").stroke).toBe("var(--eink-track)");
    expect(topLevel(".lcd-tick.is-past").stroke).toBe("var(--eink-mid)");
    expect(topLevel(".lcd-tick.is-hour.is-past").stroke).toBe("var(--eink-ink)");
    expect(topLevel(".lcd-dial-now").fill).toBe("var(--eink-ink)");
    expect(topLevel(".lcd-midnight-mark").fill).toBe("var(--eink-ink)");
    expect(topLevel(".lcd-dial-hour").fill).toBe("var(--eink-dim)");
    expect(topLevel(".lcd-dial-clock span").color).toBe("var(--eink-dim)");
  });

  it("draws the past ticks that yield to the pointer half way to the track (P-b, 50%)", () => {
    expect(topLevel(".lcd-tick.is-past.is-near-now").stroke).toBe(
      "color-mix(in srgb, var(--eink-mid) 50%, var(--eink-track))",
    );
    expect(topLevel(".lcd-tick.is-hour.is-past.is-near-now").stroke).toBe(
      "color-mix(in srgb, var(--eink-ink) 50%, var(--eink-track))",
    );
    // Future ticks near the pointer are already the track; nothing else changes them.
    const nearRules = allRules().filter((rule) => rule.selectors.some((selector) => selector.includes("is-near-now")));
    expect(nearRules.flatMap((rule) => rule.selectors).sort()).toEqual([
      ".lcd-tick.is-hour.is-past.is-near-now",
      ".lcd-tick.is-past.is-near-now",
    ]);
    for (const rule of nearRules) {
      expect(Object.keys(rule.declarations), rule.selector).toEqual(["stroke"]);
      expect(rule.atRules, rule.selector).toEqual([]);
    }
  });

  it("draws ticks 2px and hour ticks 3.4px with butt caps", () => {
    expect(topLevel(".lcd-tick")["stroke-width"]).toBe("2");
    expect(topLevel(".lcd-tick")["stroke-linecap"]).toBe("butt");
    expect(topLevel(".lcd-tick.is-hour")["stroke-width"]).toBe("3.4");
  });

  it("separates the pointer from the ticks with a paper-coloured stroke behind its fill", () => {
    const pointer = topLevel(".lcd-dial-now");

    // R-2 (2026-11-23): the paper colour where the dial sits, not the gradient's 45% stop.
    expect(pointer.stroke).toBe("var(--eink-dial-paper)");
    expect(pointer["stroke-width"]).toBe("1.5");
    expect(pointer["paint-order"]).toBe("stroke");
  });

  it("has no glow and no theme-specific dial overrides", () => {
    const dialRules = allRules().filter((rule) =>
      rule.selectors.some((selector) => /\.lcd-(ring|tick|dial|midnight)/.test(selector)),
    );

    for (const rule of dialRules) {
      expect(rule.declarations.filter, rule.selector).toBeUndefined();
      for (const selector of rule.selectors) {
        expect(selector, selector).not.toContain("data-theme");
      }
      for (const value of Object.values(rule.declarations)) {
        expect(value, rule.selector).not.toContain("--" + "lcd-");
      }
    }
  });
});
