const isMac = navigator.userAgent.includes("Mac");
const isWindows = navigator.userAgent.includes("Windows");

export const platform = {
  isMac,
  isWindows,
  isLinux: !isMac && !isWindows,
  modKey: isMac ? "⌘" : "Ctrl",
  altKey: isMac ? "⌥" : "Alt",
  shortcut(mac: string, other: string): string {
    return isMac ? mac : other;
  }
} as const;
