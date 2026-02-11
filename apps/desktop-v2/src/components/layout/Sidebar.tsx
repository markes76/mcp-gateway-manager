import { Badge } from "@/components/shared";

export type PageKey = "servers" | "sync" | "activity" | "help" | "settings";

interface NavItem {
  key: PageKey;
  label: string;
  icon: string;
  badge?: number;
  bottom?: boolean;
}

const navItems: NavItem[] = [
  { key: "servers", label: "Servers", icon: "⬡" },
  { key: "sync", label: "Sync", icon: "⇄" },
  { key: "activity", label: "Activity", icon: "◷" },
  { key: "help", label: "Help", icon: "?", bottom: true },
  { key: "settings", label: "Settings", icon: "⚙", bottom: true }
];

interface SidebarProps {
  activePage: PageKey;
  onNavigate: (page: PageKey) => void;
  collapsed: boolean;
  serverCount?: number;
  activityCount?: number;
}

export function Sidebar({
  activePage,
  onNavigate,
  collapsed,
  serverCount,
  activityCount
}: SidebarProps) {
  const topItems = navItems.filter((i) => !i.bottom);
  const bottomItems = navItems.filter((i) => i.bottom);

  function getBadge(key: PageKey): number | undefined {
    if (key === "servers") return serverCount;
    if (key === "activity") return activityCount;
    return undefined;
  }

  function renderItem(item: NavItem) {
    const isActive = activePage === item.key;
    const badge = getBadge(item.key);

    return (
      <button
        key={item.key}
        className={`sidebar-nav-item ${isActive ? "sidebar-nav-item-active" : ""}`}
        onClick={() => onNavigate(item.key)}
        title={collapsed ? item.label : undefined}
      >
        <span className="sidebar-nav-icon">{item.icon}</span>
        <span className="sidebar-nav-label">{item.label}</span>
        {badge !== undefined && badge > 0 && (
          <span className="sidebar-nav-badge">
            <Badge count={badge} />
          </span>
        )}
      </button>
    );
  }

  return (
    <aside className={`sidebar ${collapsed ? "sidebar-collapsed" : ""}`}>
      <div className="sidebar-brand">
        <div className="sidebar-logo">G</div>
        <div className="sidebar-brand-text">
          <span className="sidebar-brand-name">MCP Gateway</span>
          <span className="sidebar-brand-version">v2.0</span>
        </div>
      </div>

      <nav className="sidebar-nav">{topItems.map(renderItem)}</nav>

      <div className="sidebar-bottom">{bottomItems.map(renderItem)}</div>
    </aside>
  );
}
