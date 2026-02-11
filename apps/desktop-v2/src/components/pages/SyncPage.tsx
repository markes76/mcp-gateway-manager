import { useEffect, useState } from "react";

import type {
  AssistantSuggestionResponse,
  GatewayStateResponse,
  MatrixPolicyInput,
  ModelStatusResponse,
  SupportedPlatform,
  SyncPlanPreviewResponse
} from "@mcp-gateway/ipc-contracts";

import { Button, EmptyState, Input, Toggle } from "@/components/shared";
import { PageHeader } from "@/components/layout/PageHeader";
import { buildPolicyFromAssistantInput } from "@/lib/assistant";
import { buildSyncRequestPayload, SUPPORTED_PLATFORMS } from "@/lib/matrix";

type AddMode = "smart" | "manual";

function platformLabel(p: SupportedPlatform): string {
  return p.charAt(0).toUpperCase() + p.slice(1);
}

interface SyncPageProps {
  state: GatewayStateResponse | null;
  policies: MatrixPolicyInput[];
  onPoliciesChange: (policies: MatrixPolicyInput[]) => void;
}

export function SyncPage({ state, policies, onPoliciesChange }: SyncPageProps) {
  const [addMode, setAddMode] = useState<AddMode>("smart");
  const [urlInput, setUrlInput] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [suggestion, setSuggestion] = useState<AssistantSuggestionResponse | null>(null);
  const [analyzeError, setAnalyzeError] = useState("");
  const [modelStatus, setModelStatus] = useState<ModelStatusResponse | null>(null);

  // Manual mode state
  const [manualName, setManualName] = useState("");
  const [manualCommand, setManualCommand] = useState("");
  const [manualArgs, setManualArgs] = useState("");
  const [manualEnabled, setManualEnabled] = useState(true);
  const [manualScope, setManualScope] = useState<"all" | "selected">("all");
  const [manualPlatforms, setManualPlatforms] = useState<Record<SupportedPlatform, boolean>>({
    claude: true,
    cursor: true,
    codex: true
  });

  // Assistant form state
  const [mcpName, setMcpName] = useState("");
  const [mcpCommand, setMcpCommand] = useState("");
  const [mcpArgs, setMcpArgs] = useState("");
  const [mcpEnabled, setMcpEnabled] = useState(true);
  const [mcpScope, setMcpScope] = useState<"all" | "selected">("all");
  const [mcpPlatforms, setMcpPlatforms] = useState<Record<SupportedPlatform, boolean>>({
    claude: true,
    cursor: true,
    codex: true
  });
  const [envValues, setEnvValues] = useState<Record<string, string>>({});

  // Sync state
  const [preview, setPreview] = useState<SyncPlanPreviewResponse | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [applying, setApplying] = useState(false);
  const [syncError, setSyncError] = useState("");
  const [syncSuccess, setSyncSuccess] = useState("");

  async function handleAnalyze() {
    if (!urlInput.trim()) return;
    setAnalyzing(true);
    setAnalyzeError("");
    setSuggestion(null);

    try {
      const result = await window.mcpGateway.assistantSuggestFromUrl({ input: urlInput.trim() });
      setSuggestion(result);
      setMcpName(result.suggestedName);
      setMcpCommand(result.suggestedCommand);
      setMcpArgs(result.suggestedArgs.join(" "));

      const envMap: Record<string, string> = {};
      for (const v of result.requiredEnvVars) {
        envMap[v.name] = "";
      }
      setEnvValues(envMap);
    } catch (err) {
      setAnalyzeError(err instanceof Error ? err.message : "Analysis failed.");
    } finally {
      setAnalyzing(false);
    }
  }

  // Fetch model status on mount to show smart mode availability
  useEffect(() => {
    window.mcpGateway.getModelStatus().then(setModelStatus).catch(() => {});
  }, []);

  function handleManualAdd() {
    if (!manualName.trim() || !manualCommand.trim()) return;
    const newPolicy = buildPolicyFromAssistantInput({
      name: manualName,
      command: manualCommand,
      argsText: manualArgs,
      enabled: manualEnabled,
      envValues: {},
      scope: manualScope,
      selectedPlatforms: manualPlatforms
    });
    onPoliciesChange([...policies, newPolicy]);
    setManualName("");
    setManualCommand("");
    setManualArgs("");
  }

  function handleAddToMatrix() {
    const newPolicy = buildPolicyFromAssistantInput({
      name: mcpName,
      command: mcpCommand,
      argsText: mcpArgs,
      enabled: mcpEnabled,
      envValues,
      scope: mcpScope,
      selectedPlatforms: mcpPlatforms
    });
    onPoliciesChange([...policies, newPolicy]);
    setSuggestion(null);
    setUrlInput("");
    setMcpName("");
    setMcpCommand("");
    setMcpArgs("");
    setEnvValues({});
  }

  async function handlePreview() {
    if (!state) return;
    setPreviewing(true);
    setSyncError("");
    setPreview(null);

    try {
      const payload = buildSyncRequestPayload(policies, state);
      const result = await window.mcpGateway.previewSync(payload);
      setPreview(result);
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : "Preview failed.");
    } finally {
      setPreviewing(false);
    }
  }

  async function handleApply() {
    if (!state) return;
    setApplying(true);
    setSyncError("");
    setSyncSuccess("");

    try {
      const payload = buildSyncRequestPayload(policies, state);
      const result = await window.mcpGateway.applySync(payload);
      setSyncSuccess(
        `Sync applied: ${result.operations.length} platform(s) updated. Revision: ${result.revisionId.slice(0, 8)}`
      );
      setPreview(null);
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : "Apply failed.");
    } finally {
      setApplying(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Sync"
        actions={
          <>
            <Button onClick={handlePreview} disabled={previewing || !state}>
              {previewing ? "Previewing..." : "Preview"}
            </Button>
            <Button variant="primary" onClick={handleApply} disabled={applying || !state}>
              {applying ? "Applying..." : "Apply Sync"}
            </Button>
          </>
        }
      />
      <div className="main-content">
        {/* Add MCP section */}
        <section className="section">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "var(--space-3)" }}>
            <h3 className="section-title" style={{ margin: 0 }}>Add MCP</h3>
            <div className="segmented">
              <button
                className={`segmented-item ${addMode === "smart" ? "segmented-item-active" : ""}`}
                onClick={() => setAddMode("smart")}
              >
                Smart
              </button>
              <button
                className={`segmented-item ${addMode === "manual" ? "segmented-item-active" : ""}`}
                onClick={() => setAddMode("manual")}
              >
                Manual
              </button>
            </div>
          </div>

          {addMode === "smart" ? (
            <div className="card">
              {/* Smart mode hint when model not downloaded */}
              {modelStatus && !modelStatus.downloaded && (
                <p style={{
                  fontSize: "var(--text-sm)",
                  color: "var(--text-muted)",
                  marginBottom: "var(--space-3)",
                  padding: "var(--space-2)",
                  background: "var(--surface-hover)",
                  borderRadius: "var(--radius-sm)"
                }}>
                  Pattern matching active. Download the AI model in Settings for smarter analysis.
                </p>
              )}

              <div style={{ display: "flex", gap: "var(--space-2)" }}>
                <Input
                  placeholder="Paste URL, npm package, or GitHub repo..."
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.currentTarget.value)}
                  mono
                  style={{ flex: 1 }}
                  onKeyDown={(e) => e.key === "Enter" && handleAnalyze()}
                />
                <Button onClick={handleAnalyze} disabled={analyzing || !urlInput.trim()}>
                  {analyzing ? "Analyzing..." : "Analyze"}
                </Button>
              </div>

              {analyzeError && (
                <p style={{ color: "var(--error)", fontSize: "var(--text-sm)", marginTop: "var(--space-2)" }}>
                  {analyzeError}
                </p>
              )}

              {suggestion && (
                <div style={{ marginTop: "var(--space-4)", display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
                  {/* Provider badge */}
                  <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
                    <span
                      style={{
                        fontSize: "var(--text-xs)",
                        fontWeight: 500,
                        padding: "2px var(--space-2)",
                        borderRadius: "var(--radius-sm)",
                        background: suggestion.provider === "local-llm" ? "var(--accent)" : "var(--surface-hover)",
                        color: suggestion.provider === "local-llm" ? "#fff" : "var(--text-secondary)"
                      }}
                    >
                      {suggestion.provider === "local-llm" ? "AI Analysis" : "Pattern Match"}
                    </span>
                    <p style={{ fontSize: "var(--text-sm)", color: "var(--text-secondary)" }}>
                      {suggestion.summary}
                    </p>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-3)" }}>
                    <Input id="mcp-name" label="Server name" value={mcpName} onChange={(e) => setMcpName(e.currentTarget.value)} mono />
                    <Input id="mcp-cmd" label="Command" value={mcpCommand} onChange={(e) => setMcpCommand(e.currentTarget.value)} mono />
                    <Input id="mcp-args" label="Arguments" value={mcpArgs} onChange={(e) => setMcpArgs(e.currentTarget.value)} mono />
                    <div className="input-group">
                      <span className="input-label">Scope</span>
                      <div style={{ display: "flex", gap: "var(--space-4)", marginTop: "var(--space-1)" }}>
                        <label style={{ display: "flex", alignItems: "center", gap: "var(--space-1)", fontSize: "var(--text-sm)", cursor: "pointer" }}>
                          <input type="radio" checked={mcpScope === "all"} onChange={() => setMcpScope("all")} style={{ accentColor: "var(--accent)" }} />
                          All platforms
                        </label>
                        <label style={{ display: "flex", alignItems: "center", gap: "var(--space-1)", fontSize: "var(--text-sm)", cursor: "pointer" }}>
                          <input type="radio" checked={mcpScope === "selected"} onChange={() => setMcpScope("selected")} style={{ accentColor: "var(--accent)" }} />
                          Selected
                        </label>
                      </div>
                    </div>
                  </div>

                  {mcpScope === "selected" && (
                    <div style={{ display: "flex", gap: "var(--space-4)" }}>
                      {SUPPORTED_PLATFORMS.map((p) => (
                        <Toggle
                          key={p}
                          checked={mcpPlatforms[p]}
                          onChange={(v) => setMcpPlatforms({ ...mcpPlatforms, [p]: v })}
                          label={platformLabel(p)}
                        />
                      ))}
                    </div>
                  )}

                  {suggestion.requiredEnvVars.length > 0 && (
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-3)" }}>
                      {suggestion.requiredEnvVars.map((v) => (
                        <Input
                          key={v.name}
                          id={`env-${v.name}`}
                          label={v.name}
                          placeholder={v.example || v.description}
                          value={envValues[v.name] ?? ""}
                          onChange={(e) => setEnvValues({ ...envValues, [v.name]: e.currentTarget.value })}
                          mono
                        />
                      ))}
                    </div>
                  )}

                  <div style={{ display: "flex", gap: "var(--space-2)" }}>
                    <Toggle checked={mcpEnabled} onChange={setMcpEnabled} label="Enable on add" />
                    <span style={{ flex: 1 }} />
                    <Button variant="primary" onClick={handleAddToMatrix}>
                      Add to Matrix
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* Manual mode */
            <div className="card">
              <p style={{ fontSize: "var(--text-sm)", color: "var(--text-muted)", marginBottom: "var(--space-3)" }}>
                Manually configure an MCP server if you know the command and arguments.
              </p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-3)" }}>
                <Input
                  id="manual-name"
                  label="Server name"
                  placeholder="e.g. my-mcp-server"
                  value={manualName}
                  onChange={(e) => setManualName(e.currentTarget.value)}
                  mono
                />
                <Input
                  id="manual-cmd"
                  label="Command"
                  placeholder="e.g. npx"
                  value={manualCommand}
                  onChange={(e) => setManualCommand(e.currentTarget.value)}
                  mono
                />
                <Input
                  id="manual-args"
                  label="Arguments"
                  placeholder="e.g. -y @modelcontextprotocol/server-filesystem"
                  value={manualArgs}
                  onChange={(e) => setManualArgs(e.currentTarget.value)}
                  mono
                  style={{ gridColumn: "1 / -1" }}
                />
                <div className="input-group">
                  <span className="input-label">Scope</span>
                  <div style={{ display: "flex", gap: "var(--space-4)", marginTop: "var(--space-1)" }}>
                    <label style={{ display: "flex", alignItems: "center", gap: "var(--space-1)", fontSize: "var(--text-sm)", cursor: "pointer" }}>
                      <input type="radio" checked={manualScope === "all"} onChange={() => setManualScope("all")} style={{ accentColor: "var(--accent)" }} />
                      All platforms
                    </label>
                    <label style={{ display: "flex", alignItems: "center", gap: "var(--space-1)", fontSize: "var(--text-sm)", cursor: "pointer" }}>
                      <input type="radio" checked={manualScope === "selected"} onChange={() => setManualScope("selected")} style={{ accentColor: "var(--accent)" }} />
                      Selected
                    </label>
                  </div>
                </div>
              </div>

              {manualScope === "selected" && (
                <div style={{ display: "flex", gap: "var(--space-4)", marginTop: "var(--space-3)" }}>
                  {SUPPORTED_PLATFORMS.map((p) => (
                    <Toggle
                      key={p}
                      checked={manualPlatforms[p]}
                      onChange={(v) => setManualPlatforms({ ...manualPlatforms, [p]: v })}
                      label={platformLabel(p)}
                    />
                  ))}
                </div>
              )}

              <div style={{ display: "flex", gap: "var(--space-2)", marginTop: "var(--space-3)" }}>
                <Toggle checked={manualEnabled} onChange={setManualEnabled} label="Enable on add" />
                <span style={{ flex: 1 }} />
                <Button
                  variant="primary"
                  onClick={handleManualAdd}
                  disabled={!manualName.trim() || !manualCommand.trim()}
                >
                  Add to Matrix
                </Button>
              </div>
            </div>
          )}
        </section>

        {/* Sync preview section */}
        <section className="section">
          <h3 className="section-title">Pending Changes</h3>
          {syncSuccess && (
            <div className="card" style={{ borderLeft: "3px solid var(--success)" }}>
              <p style={{ fontSize: "var(--text-sm)", color: "var(--success)" }}>{syncSuccess}</p>
            </div>
          )}
          {syncError && (
            <div className="card" style={{ borderLeft: "3px solid var(--error)" }}>
              <p style={{ fontSize: "var(--text-sm)", color: "var(--error)" }}>{syncError}</p>
            </div>
          )}
          {preview ? (
            <div className="card">
              <p style={{ fontSize: "var(--text-sm)", fontWeight: 500, marginBottom: "var(--space-3)" }}>
                {preview.totalOperations} operation{preview.totalOperations !== 1 ? "s" : ""} across{" "}
                {Object.values(preview.byPlatform).filter((p) => p.hasChanges).length} platform(s)
              </p>
              {SUPPORTED_PLATFORMS.map((p) => {
                const plan = preview.byPlatform[p];
                return (
                  <div
                    key={p}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "var(--space-2) 0",
                      borderTop: "1px solid var(--border)",
                      fontSize: "var(--text-sm)"
                    }}
                  >
                    <span style={{ fontWeight: 500 }}>{platformLabel(p)}</span>
                    <span style={{ color: plan.hasChanges ? "var(--text-primary)" : "var(--text-muted)" }}>
                      {plan.hasChanges ? `${plan.operationCount} change(s)` : "No changes"}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptyState
              title="No preview generated"
              description="Click Preview to see what changes will be applied."
            />
          )}
        </section>
      </div>
    </>
  );
}
