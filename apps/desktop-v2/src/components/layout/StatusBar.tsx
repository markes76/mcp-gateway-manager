import { Badge } from "@/components/shared";

interface PlatformHealth {
  platform: string;
  displayName?: string;
  found: boolean;
  configPath: string;
}

interface StatusBarProps {
  platforms: PlatformHealth[];
  lastSyncedAt: string | null;
}

function platformLabel(p: string): string {
  return p.charAt(0).toUpperCase() + p.slice(1);
}

function timeSince(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function StatusBar({ platforms, lastSyncedAt }: StatusBarProps) {
  return (
    <footer className="statusbar">
      {platforms.map((p) => (
        <span key={p.platform} className="statusbar-platform" title={p.configPath || "Not found"}>
          <Badge dot variant={p.found ? "success" : "muted"} />
          <span>{p.displayName ?? platformLabel(p.platform)}</span>
        </span>
      ))}

      <span className="statusbar-spacer" />

      {lastSyncedAt && <span>Last sync: {timeSince(lastSyncedAt)}</span>}
    </footer>
  );
}
