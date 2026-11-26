import { describe, expect, it } from "vitest";
import capability from "../../src-tauri/capabilities/default.json";
import appSource from "../App.tsx?raw";
import { allCss, parseRules } from "./support/css";

// v0.4.7 acceptance: a drag across the page top selected the dashboard readouts instead of moving the window.
describe("window drag and text selection", () => {
  it("lets the page header and its title move the window", () => {
    expect(appSource).toContain('<header className="page-header" data-tauri-drag-region>');
    expect(appSource).toContain("<h2 data-tauri-drag-region>{pageTitles[activePage]}</h2>");
    expect(capability.permissions).toContain("core:window:allow-start-dragging");
  });

  it("selects no text in the window but keeps fields and error notices selectable", () => {
    const rules = parseRules(allCss()["styles.css"]).rules.filter((rule) => rule.atRules.length === 0);
    expect(rules.find((rule) => rule.selector === "body")?.declarations["user-select"]).toBe("none");
    const selectable = rules.find((rule) => rule.declarations["user-select"] === "text");
    expect(selectable?.selector).toContain("input");
    expect(selectable?.selector).toContain("textarea");
    expect(selectable?.selector).toContain(".warning");
  });
});
