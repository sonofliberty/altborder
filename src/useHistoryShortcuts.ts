import { useEffect } from "react";

type ShortcutEvent = Pick<KeyboardEvent, "key" | "ctrlKey" | "metaKey" | "shiftKey" | "altKey" | "isComposing" | "defaultPrevented">;

export function getHistoryShortcut(event: ShortcutEvent, editingText: boolean): "undo" | "redo" | null {
  if (editingText || event.defaultPrevented || event.isComposing || event.altKey || event.ctrlKey === event.metaKey) return null;
  const key = event.key.toLowerCase();
  if (key === "z") return event.shiftKey ? "redo" : "undo";
  if (key === "y" && event.ctrlKey && !event.shiftKey) return "redo";
  return null;
}

export function useHistoryShortcuts({
  enabled,
  canUndo,
  canRedo,
  undo,
  redo,
}: {
  enabled: boolean;
  canUndo: boolean;
  canRedo: boolean;
  undo: () => void;
  redo: () => void;
}) {
  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (event: KeyboardEvent) => {
      // Check the full path to preserve native undo in nested or shadow-root editors.
      const editingText = event.composedPath().some((target) => target instanceof HTMLElement
        && (target.isContentEditable || target.matches("textarea, select, [role='textbox']")
          || (target instanceof HTMLInputElement
            && !["button", "checkbox", "color", "file", "hidden", "image", "radio", "range", "reset", "submit"].includes(target.type))));
      const action = getHistoryShortcut(event, editingText);
      if ((action === "undo" && canUndo) || (action === "redo" && canRedo)) {
        event.preventDefault();
        if (action === "undo") undo();
        else redo();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled, canUndo, canRedo, undo, redo]);
}
