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

  it("draws ticks 2px and hour ticks 3.4px with butt caps", () => {
    expect(topLevel(".lcd-tick")["stroke-width"]).toBe("2");
    expect(topLevel(".lcd-tick")["stroke-linecap"]).toBe("butt");
    expect(topLevel(".lcd-tick.is-hour")["stroke-width"]).toBe("3.4");
  });

  it("separates the pointer from the ticks with a paper-coloured stroke behind its fill", () => {
    const pointer = topLevel(".lcd-dial-now");

    expect(pointer.stroke).toBe("var(--eink-paper-solid)");
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
