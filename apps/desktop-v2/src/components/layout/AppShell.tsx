import type { ReactNode } from "react";

import type { ThemeMode } from "@mcp-gateway/domain";
import type { SupportedPlatform } from "@mcp-gateway/ipc-contracts";

import { Sidebar, type PageKey } from "./Sidebar";
import { StatusBar } from "./StatusBar";
import { TitleBar } from "./TitleBar";

interface PlatformHealth {
  platform: SupportedPlatform;
  found: boolean;
  configPath: string;
}

interface AppShellProps {
  activePage: PageKey;
  onNavigate: (page: PageKey) => void;
  sidebarCollapsed: boolean;
  theme: ThemeMode;
  onThemeChange: (mode: ThemeMode) => void;
  platforms: PlatformHealth[];
  lastSyncedAt: string | null;
  serverCount: number;
  activityCount: number;
  children: ReactNode;
}

function ThemeButton({
  theme,
  onChange
}: {
  theme: ThemeMode;
  onChange: (m: ThemeMode) => void;
}) {
  const modes: ThemeMode[] = ["light", "dark", "system"];
  const icons: Record<ThemeMode, string> = { light: "☀", dark: "☾", system: "◐" };
  const next = modes[(modes.indexOf(theme) + 1) % modes.length] ?? "system";

  return (
    <button
      className="btn btn-ghost btn-icon btn-sm"
      onClick={() => onChange(next)}
      title={`Theme: ${theme} → ${next}`}
    >
      {icons[theme]}
    </button>
  );
}

export function AppShell({
  activePage,
  onNavigate,
  sidebarCollapsed,
  theme,
  onThemeChange,
  platforms,
  lastSyncedAt,
  serverCount,
  activityCount,
  children
}: AppShellProps) {
  return (
    <div className="app-shell">
      <TitleBar
        themeButton={<ThemeButton theme={theme} onChange={onThemeChange} />}
      />
      <div className="app-body">
        <Sidebar
          activePage={activePage}
          onNavigate={onNavigate}
          collapsed={sidebarCollapsed}
          serverCount={serverCount}
          activityCount={activityCount}
        />
        <main className="main-panel">{children}</main>
      </div>
      <StatusBar platforms={platforms} lastSyncedAt={lastSyncedAt} />
    </div>
  );
}
