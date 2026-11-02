import { describe, expect, it } from "vitest";
import { getHistoryShortcut } from "./useHistoryShortcuts";

const shortcut = {
  key: "z",
  ctrlKey: true,
  metaKey: false,
  shiftKey: false,
  altKey: false,
  isComposing: false,
  defaultPrevented: false,
};

describe("history keyboard shortcuts", () => {
  it("supports Ctrl and Command undo and shifted redo", () => {
    for (const modifiers of [{ ctrlKey: true, metaKey: false }, { ctrlKey: false, metaKey: true }]) {
      expect(getHistoryShortcut({ ...shortcut, ...modifiers }, false)).toBe("undo");
      expect(getHistoryShortcut({ ...shortcut, ...modifiers, key: "Z", shiftKey: true }, false)).toBe("redo");
    }
  });

  it("supports Ctrl+Y without taking Command+Y or Ctrl+Shift+Y", () => {
    expect(getHistoryShortcut({ ...shortcut, key: "y" }, false)).toBe("redo");
    expect(getHistoryShortcut({ ...shortcut, key: "y", ctrlKey: false, metaKey: true }, false)).toBeNull();
    expect(getHistoryShortcut({ ...shortcut, key: "y", shiftKey: true }, false)).toBeNull();
  });

  it("leaves text undo, composition, and handled events alone", () => {
    expect(getHistoryShortcut(shortcut, true)).toBeNull();
    expect(getHistoryShortcut({ ...shortcut, isComposing: true }, false)).toBeNull();
    expect(getHistoryShortcut({ ...shortcut, defaultPrevented: true }, false)).toBeNull();
  });

  it("does not treat ordinary typing or unrelated modifiers as history commands", () => {
    expect(getHistoryShortcut({ ...shortcut, ctrlKey: false }, false)).toBeNull();
    expect(getHistoryShortcut({ ...shortcut, metaKey: true }, false)).toBeNull();
    expect(getHistoryShortcut({ ...shortcut, altKey: true }, false)).toBeNull();
    expect(getHistoryShortcut({ ...shortcut, key: "x" }, false)).toBeNull();
  });
});
