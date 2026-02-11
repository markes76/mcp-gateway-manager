import { useEffect, useState } from "react";

import type { ThemeMode } from "@mcp-gateway/domain";
import type {
  GatewayStateResponse,
  MatrixPolicyInput
} from "@mcp-gateway/ipc-contracts";

import { AppShell, type PageKey } from "@/components/layout";
import { ActivityPage, HelpPage, ServersPage, SettingsPage, SyncPage } from "@/components/pages";
import { derivePoliciesFromState } from "@/lib/matrix";
import { applyTheme, resolveTheme } from "@/lib/theme";

export default function App() {
  const [activePage, setActivePage] = useState<PageKey>("servers");
  const [theme, setTheme] = useState<ThemeMode>("system");
  const [sidebarCollapsed] = useState(false);

  const [state, setState] = useState<GatewayStateResponse | null>(null);
  const [policies, setPolicies] = useState<MatrixPolicyInput[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    window.mcpGateway
      .getThemePreference()
      .then((res) => {
        setTheme(res.mode);
        applyTheme(resolveTheme(res.mode));
      })
      .catch(() => {});
  }, []);

  function handleThemeChange(mode: ThemeMode) {
    setTheme(mode);
    applyTheme(resolveTheme(mode));
    window.mcpGateway.setThemePreference(mode).catch(() => {});
  }

  async function loadState() {
    setLoading(true);
    try {
      const result = await window.mcpGateway.loadGatewayState();
      setState(result);
      setPolicies(derivePoliciesFromState(result));
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadState();
  }, []);

  const platforms = (state?.platforms ?? []).map((s) => ({
    platform: s.platform,
    found: s.found,
    configPath: s.configPath
  }));

  const serverCount = policies.length;
  const activityCount = 0;

  function renderPage() {
    switch (activePage) {
      case "servers":
        return (
          <ServersPage
            state={state}
            policies={policies}
            onPoliciesChange={setPolicies}
            onNavigateToSync={() => setActivePage("sync")}
            loading={loading}
            onRefresh={loadState}
          />
        );
      case "sync":
        return (
          <SyncPage
            state={state}
            policies={policies}
            onPoliciesChange={setPolicies}
          />
        );
      case "activity":
        return <ActivityPage />;
      case "help":
        return <HelpPage />;
      case "settings":
        return (
          <SettingsPage
            theme={theme}
            onThemeChange={handleThemeChange}
          />
        );
      default:
        return null;
    }
  }

  return (
    <AppShell
      activePage={activePage}
      onNavigate={setActivePage}
      sidebarCollapsed={sidebarCollapsed}
      theme={theme}
      onThemeChange={handleThemeChange}
      platforms={platforms}
      lastSyncedAt={state?.lastAppliedAt ?? null}
      serverCount={serverCount}
      activityCount={activityCount}
    >
      {renderPage()}
    </AppShell>
  );
}
