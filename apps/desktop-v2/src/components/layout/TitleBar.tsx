import { platform } from "@/lib/platform";

interface TitleBarProps {
  themeButton?: React.ReactNode;
}

export function TitleBar({ themeButton }: TitleBarProps) {
  return (
    <header className="titlebar titlebar-drag">
      <div className="titlebar-left titlebar-no-drag">
        {/* macOS traffic lights occupy ~70px on the left */}
        {platform.isMac && <div style={{ width: 60 }} />}
      </div>
      <span className="titlebar-title">MCP Gateway Manager</span>
      <div className="titlebar-right titlebar-no-drag">{themeButton}</div>
    </header>
  );
}
