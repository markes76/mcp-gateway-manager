import { useCallback, useEffect, useRef, useState } from "react";

import type { ThemeMode } from "@mcp-gateway/domain";
import type {
  GatewayStateResponse,
  ModelStatusResponse,
  PlatformSnapshot,
  SupportedPlatform,
  UserConfigResponse
} from "@mcp-gateway/ipc-contracts";

import { Button, Toggle } from "@/components/shared";
import { PageHeader } from "@/components/layout/PageHeader";
import { SUPPORTED_PLATFORMS } from "@/lib/matrix";

function platformLabel(p: SupportedPlatform): string {
  return p.charAt(0).toUpperCase() + p.slice(1);
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

interface SettingsPageProps {
  theme: ThemeMode;
  onThemeChange: (mode: ThemeMode) => void;
  state: GatewayStateResponse | null;
  onRefresh: () => void;
}

export function SettingsPage({ theme, onThemeChange, state, onRefresh }: SettingsPageProps) {
  const [config, setConfig] = useState<UserConfigResponse | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // AI model state
  const [modelStatus, setModelStatus] = useState<ModelStatusResponse | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Custom platform form
  const [customName, setCustomName] = useState("");
  const [customPath, setCustomPath] = useState("");
  const [addingCustom, setAddingCustom] = useState(false);
  const [customError, setCustomError] = useState("");

  // Derived platform lists
  const knownPlatforms: PlatformSnapshot[] =
    state?.platforms.filter((s) => s.category === "known") ?? [];
  const customPlatforms: PlatformSnapshot[] =
    state?.platforms.filter((s) => s.category === "custom") ?? [];

  // Fetch initial state
  const refreshModelStatus = useCallback(async () => {
    try {
      const status = await window.mcpGateway.getModelStatus();
      setModelStatus(status);
      return status;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    window.mcpGateway.getUserConfig().then(setConfig).catch(() => {});
    refreshModelStatus();
  }, [refreshModelStatus]);

  // Poll while downloading
  useEffect(() => {
    if (modelStatus?.downloading && !pollRef.current) {
      pollRef.current = setInterval(async () => {
        const status = await refreshModelStatus();
        if (status && !status.downloading) {
          if (pollRef.current) {
            clearInterval(pollRef.current);
            pollRef.current = null;
          }
        }
      }, 500);
    }

    if (modelStatus && !modelStatus.downloading && pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [modelStatus?.downloading, refreshModelStatus]);

  async function handleSave() {
    if (!config) return;
    setSaving(true);
    setSaved(false);

    try {
      const updated = await window.mcpGateway.updateUserConfig({
        platforms: config.platforms,
        assistant: config.assistant,
        backup: config.backup
      });
      setConfig(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      // Handle error
    } finally {
      setSaving(false);
    }
  }

  async function handlePickPath(platform: SupportedPlatform) {
    try {
      const result = await window.mcpGateway.pickConfigFilePath({ platform });
      if (result.path && config) {
        setConfig({
          ...config,
          platforms: {
            ...config.platforms,
            [platform]: {
              ...config.platforms[platform],
              configPathOverride: result.path
            }
          }
        });
      }
    } catch {
      // Handle error
    }
  }

  async function handlePickCustomPath() {
    try {
      const result = await window.mcpGateway.pickConfigFilePath({});
      if (result.path) {
        setCustomPath(result.path);
      }
    } catch {
      // Handle error
    }
  }

  async function handleAddCustomPlatform() {
    if (!customName.trim() || !customPath.trim()) return;
    setAddingCustom(true);
    setCustomError("");

    try {
      await window.mcpGateway.addCustomPlatform({
        name: customName.trim(),
        configPath: customPath.trim()
      });
      setCustomName("");
      setCustomPath("");
      onRefresh();
    } catch (err) {
      setCustomError(err instanceof Error ? err.message : "Failed to add platform.");
    } finally {
      setAddingCustom(false);
    }
  }

  async function handleRemoveCustomPlatform(platformId: string) {
    try {
      await window.mcpGateway.removeCustomPlatform({ id: platformId });
      onRefresh();
    } catch {
      // Handle error
    }
  }

  async function handleDownloadModel() {
    const status = await window.mcpGateway.downloadModel();
    setModelStatus(status);
  }

  const themes: ThemeMode[] = ["light", "dark", "system"];

  const isDownloading = modelStatus?.downloading ?? false;
  const isDownloaded = modelStatus?.downloaded ?? false;
  const pct = modelStatus ? Math.round(modelStatus.downloadProgress * 100) : 0;

  return (
    <>
      <PageHeader
        title="Settings"
        actions={
          <>
            {saved && (
              <span style={{ fontSize: "var(--text-sm)", color: "var(--success)" }}>Saved</span>
            )}
            <Button onClick={handleSave} disabled={saving || !config}>
              {saving ? "Saving..." : "Save"}
            </Button>
          </>
        }
      />
      <div className="main-content" style={{ maxWidth: 640 }}>
        {/* Appearance */}
        <section className="section">
          <h3 className="section-title">Appearance</h3>
          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
            <span style={{ fontSize: "var(--text-sm)", color: "var(--text-secondary)", width: 60 }}>
              Theme
            </span>
            <div className="segmented">
              {themes.map((m) => (
                <button
                  key={m}
                  className={`segmented-item ${theme === m ? "segmented-item-active" : ""}`}
                  onClick={() => onThemeChange(m)}
                >
                  {m.charAt(0).toUpperCase() + m.slice(1)}
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* Platform Config Paths */}
        <section className="section">
          <h3 className="section-title">Platform Config Paths</h3>
          {config &&
            SUPPORTED_PLATFORMS.map((p) => {
              const pc = config.platforms[p];
              return (
                <div
                  key={p}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "var(--space-3)",
                    padding: "var(--space-2) 0",
                    borderBottom: "1px solid var(--border)"
                  }}
                >
                  <span style={{ width: 60, fontSize: "var(--text-sm)", fontWeight: 500 }}>
                    {platformLabel(p)}
                  </span>
                  <code
                    style={{
                      flex: 1,
                      fontSize: "var(--text-sm)",
                      fontFamily: "var(--font-mono)",
                      color: "var(--text-secondary)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap"
                    }}
                    className="selectable"
                  >
                    {pc.configPathOverride || "(default)"}
                  </code>
                  <Button size="sm" variant="ghost" onClick={() => handlePickPath(p)}>
                    Change
                  </Button>
                </div>
              );
            })}
        </section>

        {/* Discovered Platforms */}
        {knownPlatforms.length > 0 && (
          <section className="section">
            <h3 className="section-title">Discovered Platforms</h3>
            <p style={{ fontSize: "var(--text-sm)", color: "var(--text-muted)", marginBottom: "var(--space-3)" }}>
              These platforms were automatically detected on your machine.
            </p>
            {knownPlatforms.map((snap) => (
              <div
                key={snap.platform}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "var(--space-3)",
                  padding: "var(--space-2) 0",
                  borderBottom: "1px solid var(--border)"
                }}
              >
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: snap.found ? "var(--success)" : "var(--text-muted)",
                    flexShrink: 0
                  }}
                />
                <span style={{ width: 100, fontSize: "var(--text-sm)", fontWeight: 500 }}>
                  {snap.displayName}
                </span>
                <code
                  style={{
                    flex: 1,
                    fontSize: "var(--text-sm)",
                    fontFamily: "var(--font-mono)",
                    color: "var(--text-secondary)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap"
                  }}
                  className="selectable"
                >
                  {snap.configPath || "Not found"}
                </code>
                <span
                  style={{
                    fontSize: "var(--text-xs)",
                    color: snap.found ? "var(--success)" : "var(--text-muted)"
                  }}
                >
                  {snap.found ? `${Object.keys(snap.servers).length} servers` : "—"}
                </span>
              </div>
            ))}
          </section>
        )}

        {/* Custom Platforms */}
        <section className="section">
          <h3 className="section-title">Custom Platforms</h3>
          <p style={{ fontSize: "var(--text-sm)", color: "var(--text-muted)", marginBottom: "var(--space-3)" }}>
            Add any application that stores MCP servers in a JSON config file.
          </p>

          {/* Existing custom platforms */}
          {customPlatforms.map((snap) => (
            <div
              key={snap.platform}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "var(--space-3)",
                padding: "var(--space-2) 0",
                borderBottom: "1px solid var(--border)"
              }}
            >
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: snap.found ? "var(--success)" : "var(--text-muted)",
                  flexShrink: 0
                }}
              />
              <span style={{ fontSize: "var(--text-sm)", fontWeight: 500, minWidth: 80 }}>
                {snap.displayName}
              </span>
              <code
                style={{
                  flex: 1,
                  fontSize: "var(--text-sm)",
                  fontFamily: "var(--font-mono)",
                  color: "var(--text-secondary)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap"
                }}
                className="selectable"
              >
                {snap.configPath}
              </code>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => handleRemoveCustomPlatform(snap.platform)}
              >
                Remove
              </Button>
            </div>
          ))}

          {/* Add new custom platform */}
          <div
            style={{
              display: "flex",
              gap: "var(--space-2)",
              marginTop: "var(--space-3)",
              alignItems: "flex-end"
            }}
          >
            <div style={{ flex: "0 0 160px" }}>
              <label
                style={{
                  display: "block",
                  fontSize: "var(--text-xs)",
                  color: "var(--text-muted)",
                  marginBottom: "var(--space-1)"
                }}
              >
                Platform name
              </label>
              <input
                className="input input-mono"
                placeholder="e.g. My IDE"
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                style={{ width: "100%" }}
              />
            </div>
            <div style={{ flex: 1 }}>
              <label
                style={{
                  display: "block",
                  fontSize: "var(--text-xs)",
                  color: "var(--text-muted)",
                  marginBottom: "var(--space-1)"
                }}
              >
                Config file path
              </label>
              <div style={{ display: "flex", gap: "var(--space-2)" }}>
                <input
                  className="input input-mono"
                  placeholder="/path/to/mcp-config.json"
                  value={customPath}
                  onChange={(e) => setCustomPath(e.target.value)}
                  style={{ flex: 1 }}
                />
                <Button size="sm" variant="ghost" onClick={handlePickCustomPath}>
                  Browse
                </Button>
              </div>
            </div>
            <Button
              onClick={handleAddCustomPlatform}
              disabled={addingCustom || !customName.trim() || !customPath.trim()}
            >
              {addingCustom ? "Adding..." : "Add"}
            </Button>
          </div>

          {customError && (
            <p style={{ fontSize: "var(--text-sm)", color: "var(--error)", marginTop: "var(--space-2)" }}>
              {customError}
            </p>
          )}
        </section>

        {/* AI Model */}
        <section className="section">
          <h3 className="section-title">AI Model</h3>
          <p style={{ fontSize: "var(--text-sm)", color: "var(--text-secondary)", marginBottom: "var(--space-3)" }}>
            A local AI model powers smart MCP analysis. No API keys or cloud services required.
          </p>
          <div className="card">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <p style={{ fontSize: "var(--text-sm)", fontWeight: 500 }}>
                  {modelStatus?.modelName ?? "Qwen 2.5 1.5B Instruct (Q4_K_M)"}
                </p>
                <p style={{ fontSize: "var(--text-sm)", color: "var(--text-muted)", marginTop: "var(--space-1)" }}>
                  {isDownloaded
                    ? `Downloaded${modelStatus?.sizeBytes ? ` — ${formatBytes(modelStatus.sizeBytes)}` : ""}`
                    : isDownloading
                      ? `Downloading — ${formatBytes(modelStatus?.downloadedBytes ?? 0)} / ${modelStatus?.totalBytes ? formatBytes(modelStatus.totalBytes) : "~900 MB"}`
                      : "Not downloaded — ~900 MB"}
                </p>
              </div>
              {isDownloaded ? (
                <span
                  style={{
                    fontSize: "var(--text-sm)",
                    fontWeight: 500,
                    color: "var(--success)",
                    padding: "var(--space-1) var(--space-2)",
                    borderRadius: "var(--radius-sm)",
                    background: "var(--success-bg, rgba(52,211,153,0.1))"
                  }}
                >
                  Ready
                </span>
              ) : (
                <Button
                  variant="primary"
                  onClick={handleDownloadModel}
                  disabled={isDownloading}
                >
                  {isDownloading ? `${pct}%` : "Download"}
                </Button>
              )}
            </div>

            {/* Progress bar */}
            {isDownloading && (
              <div
                style={{
                  marginTop: "var(--space-3)",
                  height: 4,
                  borderRadius: 2,
                  background: "var(--border)",
                  overflow: "hidden"
                }}
              >
                <div
                  style={{
                    height: "100%",
                    width: `${pct}%`,
                    borderRadius: 2,
                    background: "var(--accent)",
                    transition: "width 0.3s ease"
                  }}
                />
              </div>
            )}

            {/* Error */}
            {modelStatus?.downloadError && (
              <p style={{ fontSize: "var(--text-sm)", color: "var(--error)", marginTop: "var(--space-2)" }}>
                {modelStatus.downloadError}
              </p>
            )}

            {/* Model path */}
            {isDownloaded && (
              <p style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", marginTop: "var(--space-2)", fontFamily: "var(--font-mono)" }}>
                {modelStatus?.modelPath}
              </p>
            )}
          </div>
        </section>

        {/* Backups */}
        <section className="section">
          <h3 className="section-title">Backups</h3>
          {config && (
            <Toggle
              checked={config.backup.promptBeforeApply}
              onChange={(v) =>
                setConfig({ ...config, backup: { ...config.backup, promptBeforeApply: v } })
              }
              label="Prompt before apply"
            />
          )}
        </section>

        {/* About */}
        <section className="section">
          <h3 className="section-title">About</h3>
          <div style={{ fontSize: "var(--text-sm)", color: "var(--text-muted)" }}>
            <p>MCP Gateway Manager v2.0.0</p>
            <p style={{ marginTop: "var(--space-1)" }}>MIT License</p>
          </div>
        </section>
      </div>
    </>
  );
}
