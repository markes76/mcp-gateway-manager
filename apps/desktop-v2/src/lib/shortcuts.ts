import { platform } from "./platform";

export interface Shortcut {
  key: string;
  mod?: boolean;
  shift?: boolean;
  alt?: boolean;
  label: string;
  display: string;
}

export function createShortcut(params: {
  key: string;
  mod?: boolean;
  shift?: boolean;
  label: string;
}): Shortcut {
  const parts: string[] = [];
  if (params.mod) parts.push(platform.modKey);
  if (params.shift) parts.push(platform.isMac ? "⇧" : "Shift");
  parts.push(params.key.toUpperCase());

  return {
    key: params.key.toLowerCase(),
    mod: params.mod,
    shift: params.shift,
    label: params.label,
    display: parts.join("")
  };
}

export const shortcuts = {
  servers: createShortcut({ key: "1", mod: true, label: "Servers" }),
  sync: createShortcut({ key: "2", mod: true, label: "Sync" }),
  activity: createShortcut({ key: "3", mod: true, label: "Activity" }),
  settings: createShortcut({ key: ",", mod: true, label: "Settings" }),
  toggleSidebar: createShortcut({ key: "b", mod: true, label: "Toggle sidebar" }),
  addMcp: createShortcut({ key: "n", mod: true, label: "Add MCP" }),
  previewSync: createShortcut({ key: "p", mod: true, shift: true, label: "Preview sync" }),
  applySync: createShortcut({ key: "a", mod: true, shift: true, label: "Apply sync" }),
  refresh: createShortcut({ key: "r", mod: true, label: "Refresh" })
} as const;

export function matchesShortcut(e: KeyboardEvent, shortcut: Shortcut): boolean {
  const modPressed = platform.isMac ? e.metaKey : e.ctrlKey;
  if (shortcut.mod && !modPressed) return false;
  if (!shortcut.mod && modPressed) return false;
  if (shortcut.shift && !e.shiftKey) return false;
  if (!shortcut.shift && e.shiftKey) return false;
  return e.key.toLowerCase() === shortcut.key;
}
