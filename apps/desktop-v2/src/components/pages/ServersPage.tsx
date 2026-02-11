import { useState } from "react";

import type {
  GatewayStateResponse,
  MatrixPolicyInput,
  SupportedPlatform
} from "@mcp-gateway/ipc-contracts";

import { Badge, Button, EmptyState } from "@/components/shared";
import { PageHeader } from "@/components/layout/PageHeader";
import {
  addPolicyDefinitionForPlatform,
  hasPlatformDefinition,
  isPolicySharedAcrossPlatforms,
  removePolicyDefinitionForPlatform,
  sharePolicyAcrossAllPlatforms,
  SUPPORTED_PLATFORMS
} from "@/lib/matrix";

interface ServersPageProps {
  state: GatewayStateResponse | null;
  policies: MatrixPolicyInput[];
  onPoliciesChange: (policies: MatrixPolicyInput[]) => void;
  onNavigateToSync: () => void;
  loading: boolean;
  onRefresh: () => void;
}

function platformLabel(p: SupportedPlatform): string {
  return p.charAt(0).toUpperCase() + p.slice(1);
}

function countServers(state: GatewayStateResponse, platform: SupportedPlatform): number {
  const snap = state.platforms.find((s) => s.platform === platform);
  return snap ? Object.keys(snap.servers).length : 0;
}

export function ServersPage({
  state,
  policies,
  onPoliciesChange,
  onNavigateToSync,
  loading,
  onRefresh
}: ServersPageProps) {
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  function handleTogglePlatform(policyName: string, platform: SupportedPlatform) {
    onPoliciesChange(
      policies.flatMap((p) => {
        if (p.name !== policyName) return [p];
        if (hasPlatformDefinition(p, platform)) {
          const result = removePolicyDefinitionForPlatform(p, platform);
          return result ? [result] : [];
        } else {
          return [addPolicyDefinitionForPlatform(p, platform)];
        }
      })
    );
  }

  function handleShareAll(policyName: string) {
    onPoliciesChange(
      policies.map((p) => (p.name === policyName ? sharePolicyAcrossAllPlatforms(p) : p))
    );
  }

  return (
    <>
      <PageHeader
        title="Servers"
        actions={
          <>
            <Button onClick={onRefresh} disabled={loading}>
              {loading ? "Loading..." : "Refresh"}
            </Button>
            <Button variant="primary" onClick={onNavigateToSync}>
              + Add MCP
            </Button>
          </>
        }
      />
      <div className="main-content">
        {/* Platform summary strip */}
        {state && (
          <div style={{ display: "flex", gap: "var(--space-3)" }}>
            {SUPPORTED_PLATFORMS.map((p) => {
              const snap = state.platforms.find((s) => s.platform === p);
              return (
                <div key={p} className="card card-compact" style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
                    <Badge dot variant={snap?.found ? "success" : "muted"} />
                    <span style={{ fontWeight: 500 }}>{platformLabel(p)}</span>
                  </div>
                  <div
                    style={{
                      fontSize: "var(--text-xs)",
                      color: "var(--text-muted)",
                      marginTop: "var(--space-1)"
                    }}
                  >
                    {snap?.found ? `${countServers(state, p)} servers` : "Not configured"}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Server matrix table */}
        {policies.length === 0 ? (
          <EmptyState
            icon="⬡"
            title="No MCP servers configured"
            description="Add your first MCP server to manage it across platforms."
            action={
              <Button variant="primary" onClick={onNavigateToSync}>
                + Add MCP
              </Button>
            }
          />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Server</th>
                  {SUPPORTED_PLATFORMS.map((p) => (
                    <th key={p} className="col-center">
                      {platformLabel(p)}
                    </th>
                  ))}
                  <th>Status</th>
                  <th style={{ width: 80 }} />
                </tr>
              </thead>
              <tbody>
                {policies.map((policy) => {
                  const shared = isPolicySharedAcrossPlatforms(policy);
                  const isExpanded = expandedRow === policy.name;

                  return (
                    <tr
                      key={policy.name}
                      className="table-row-hover"
                      onClick={() => setExpandedRow(isExpanded ? null : policy.name)}
                      style={{ cursor: "pointer" }}
                    >
                      <td className="table-cell-mono">{policy.name}</td>
                      {SUPPORTED_PLATFORMS.map((p) => {
                        const hasDef = hasPlatformDefinition(policy, p);
                        const enabled = hasDef && policy.platformEnabled[p];
                        return (
                          <td key={p} className="col-center">
                            {hasDef ? (
                              <button
                                className={enabled ? "table-cell-check" : "table-cell-disabled"}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleTogglePlatform(policy.name, p);
                                }}
                                title={`${enabled ? "Remove from" : "Add to"} ${platformLabel(p)}`}
                                style={{
                                  background: "none",
                                  border: "none",
                                  cursor: "pointer",
                                  fontSize: "var(--text-md)"
                                }}
                              >
                                {enabled ? "✓" : "○"}
                              </button>
                            ) : (
                              <button
                                className="table-cell-dash"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleTogglePlatform(policy.name, p);
                                }}
                                title={`Add to ${platformLabel(p)}`}
                                style={{
                                  background: "none",
                                  border: "none",
                                  cursor: "pointer",
                                  fontSize: "var(--text-md)"
                                }}
                              >
                                —
                              </button>
                            )}
                          </td>
                        );
                      })}
                      <td>
                        <span
                          style={{
                            fontSize: "var(--text-sm)",
                            color: "var(--text-muted)"
                          }}
                        >
                          {shared ? "Shared" : "Per-platform"}
                        </span>
                      </td>
                      <td>
                        {!shared && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleShareAll(policy.name);
                            }}
                          >
                            Share
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
