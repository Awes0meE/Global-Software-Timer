import { describe, expect, it } from "vitest";
import { shortcutAction } from "../useKeyboardShortcuts";

type KeyInit = Partial<Pick<KeyboardEvent, "key" | "ctrlKey" | "altKey" | "shiftKey" | "metaKey">> & {
  target?: Element;
};

function key({ target = document.body, ...init }: KeyInit) {
  return {
    key: "",
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    metaKey: false,
    defaultPrevented: false,
    target,
    ...init,
  } as unknown as KeyboardEvent;
}

describe("keyboard shortcuts (Apple HIG: common commands have shortcuts)", () => {
  it.each(["1", "2", "3", "4", "5", "6"])("Ctrl+%s opens the matching sidebar page", (digit) => {
    expect(shortcutAction(key({ key: digit, ctrlKey: true }))).toEqual({ kind: "page", index: Number(digit) - 1 });
  });

  it("Ctrl+, opens 设置, as on the Mac", () => {
    expect(shortcutAction(key({ key: ",", ctrlKey: true }))).toEqual({ kind: "settings" });
  });

  it("Ctrl+← and Ctrl+→ step the viewed day", () => {
    expect(shortcutAction(key({ key: "ArrowLeft", ctrlKey: true }))).toEqual({ kind: "day", delta: -1 });
    expect(shortcutAction(key({ key: "ArrowRight", ctrlKey: true }))).toEqual({ kind: "day", delta: 1 });
  });

  it("ignores keys without Ctrl, or with another modifier", () => {
    expect(shortcutAction(key({ key: "1" }))).toBeNull();
    expect(shortcutAction(key({ key: "1", ctrlKey: true, shiftKey: true }))).toBeNull();
    expect(shortcutAction(key({ key: "1", ctrlKey: true, altKey: true }))).toBeNull();
    expect(shortcutAction(key({ key: "ArrowLeft", ctrlKey: true, metaKey: true }))).toBeNull();
    expect(shortcutAction(key({ key: "7", ctrlKey: true }))).toBeNull();
  });

  it("leaves text fields and dialogs their own keys", () => {
    const input = document.createElement("input");
    document.body.append(input);
    const dialog = document.createElement("div");
    dialog.setAttribute("role", "dialog");
    const inside = document.createElement("button");
    dialog.append(inside);
    document.body.append(dialog);

    expect(shortcutAction(key({ key: "ArrowLeft", ctrlKey: true, target: input }))).toBeNull();
    expect(shortcutAction(key({ key: "1", ctrlKey: true, target: inside }))).toBeNull();
    expect(shortcutAction(key({ key: "1", ctrlKey: true, defaultPrevented: true } as KeyInit))).toBeNull();

    input.remove();
    dialog.remove();
  });
});
