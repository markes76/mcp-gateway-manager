import { useState } from "react";

import type {
  GatewayStateResponse,
  MatrixPolicyInput
} from "@mcp-gateway/ipc-contracts";

import { Badge, Button, EmptyState } from "@/components/shared";
import { PageHeader } from "@/components/layout/PageHeader";
import {
  addPolicyDefinitionForPlatform,
  getAllPlatformIds,
  hasPlatformDefinition,
  isPolicySharedAcrossPlatforms,
  removePolicyDefinitionForPlatform,
  sharePolicyAcrossAllPlatforms
} from "@/lib/matrix";

interface ServersPageProps {
  state: GatewayStateResponse | null;
  policies: MatrixPolicyInput[];
  onPoliciesChange: (policies: MatrixPolicyInput[]) => void;
  onNavigateToSync: () => void;
  loading: boolean;
  onRefresh: () => void;
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
  const allPlatformIds = state ? getAllPlatformIds(state) : [];

  function handleTogglePlatform(policyName: string, platform: string) {
    onPoliciesChange(
      policies.flatMap((p) => {
        if (p.name !== policyName) return [p];
        if (hasPlatformDefinition(p, platform)) {
          const result = removePolicyDefinitionForPlatform(p, platform);
          return result ? [result] : [];
        } else {
          return [addPolicyDefinitionForPlatform(p, platform, allPlatformIds)];
        }
      })
    );
  }

  function handleShareAll(policyName: string) {
    onPoliciesChange(
      policies.map((p) =>
        p.name === policyName ? sharePolicyAcrossAllPlatforms(p, allPlatformIds) : p
      )
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
          <div style={{ display: "flex", gap: "var(--space-3)", flexWrap: "wrap" }}>
            {state.platforms.map((snap) => (
              <div
                key={snap.platform}
                className="card card-compact"
                style={{ flex: "1 1 140px", minWidth: 140, maxWidth: 220 }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
                  <Badge dot variant={snap.found ? "success" : "muted"} />
                  <span style={{ fontWeight: 500, fontSize: "var(--text-sm)" }}>
                    {snap.displayName}
                  </span>
                  {snap.category !== "builtin" && (
                    <span
                      style={{
                        fontSize: "var(--text-xs)",
                        color: "var(--text-muted)",
                        padding: "0 var(--space-1)",
                        border: "1px solid var(--border)",
                        borderRadius: "var(--radius-sm)"
                      }}
                    >
                      {snap.category}
                    </span>
                  )}
                </div>
                <div
                  style={{
                    fontSize: "var(--text-xs)",
                    color: "var(--text-muted)",
                    marginTop: "var(--space-1)"
                  }}
                >
                  {snap.found
                    ? `${Object.keys(snap.servers).length} servers`
                    : "Not configured"}
                </div>
              </div>
            ))}
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
                  {state?.platforms.map((snap) => (
                    <th key={snap.platform} className="col-center">
                      {snap.displayName}
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
                      {state?.platforms.map((snap) => {
                        const p = snap.platform;
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
                                title={`${enabled ? "Remove from" : "Add to"} ${snap.displayName}`}
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
                                title={`Add to ${snap.displayName}`}
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
