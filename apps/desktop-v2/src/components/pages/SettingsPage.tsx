import { useCallback, useEffect, useRef, useState } from "react";

import type { ThemeMode } from "@mcp-gateway/domain";
import type {
  ModelStatusResponse,
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
}

export function SettingsPage({ theme, onThemeChange }: SettingsPageProps) {
  const [config, setConfig] = useState<UserConfigResponse | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // AI model state
  const [modelStatus, setModelStatus] = useState<ModelStatusResponse | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

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

  // Poll while downloading — start/stop based on modelStatus.downloading
  useEffect(() => {
    if (modelStatus?.downloading && !pollRef.current) {
      pollRef.current = setInterval(async () => {
        const status = await refreshModelStatus();
        // Stop polling once download finishes
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

  async function handleDownloadModel() {
    const status = await window.mcpGateway.downloadModel();
    setModelStatus(status);
    // Polling will automatically start via the useEffect above
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
