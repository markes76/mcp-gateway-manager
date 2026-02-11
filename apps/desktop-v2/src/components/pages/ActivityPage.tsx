import { useEffect, useState } from "react";

import type {
  ActivityEntry,
  RevisionSummary,
  SupportedPlatform
} from "@mcp-gateway/ipc-contracts";

import { Button, EmptyState } from "@/components/shared";
import { PageHeader } from "@/components/layout/PageHeader";

interface TimelineEntry {
  id: string;
  timestamp: string;
  title: string;
  detail: string;
  type: ActivityEntry["type"];
  revisionId?: string;
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return iso;
  }
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (date.toDateString() === today.toDateString()) return "Today";
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

function groupByDate(entries: TimelineEntry[]): Map<string, TimelineEntry[]> {
  const groups = new Map<string, TimelineEntry[]>();
  for (const entry of entries) {
    const dateKey = formatDate(entry.timestamp);
    const group = groups.get(dateKey) ?? [];
    group.push(entry);
    groups.set(dateKey, group);
  }
  return groups;
}

function typeIcon(type: ActivityEntry["type"]): string {
  switch (type) {
    case "sync-apply": return "⇄";
    case "assistant-analysis": return "◎";
    case "settings-update": return "⚙";
    case "platform-restart": return "↻";
    case "manual-backup": return "⧉";
    case "revision-revert": return "↩";
    default: return "·";
  }
}

export function ActivityPage() {
  const [entries, setEntries] = useState<TimelineEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [reverting, setReverting] = useState<string | null>(null);

  async function loadData() {
    setLoading(true);
    try {
      const [activityRes, revisionRes] = await Promise.all([
        window.mcpGateway.getActivityLog(),
        window.mcpGateway.getRevisionHistory()
      ]);

      const activityEntries: TimelineEntry[] = activityRes.entries.map((e) => ({
        id: e.id,
        timestamp: e.timestamp,
        title: e.title,
        detail: e.detail,
        type: e.type
      }));

      const revisionEntries: TimelineEntry[] = revisionRes.revisions.map((r) => ({
        id: `rev-${r.revisionId}`,
        timestamp: r.appliedAt,
        title: `Sync applied — ${r.totalOperations} ops across ${r.platforms.join(", ")}`,
        detail: `Revision: ${r.revisionId.slice(0, 8)}`,
        type: "sync-apply" as const,
        revisionId: r.revisionId
      }));

      const merged = [...activityEntries, ...revisionEntries].sort(
        (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );

      // Deduplicate by id
      const seen = new Set<string>();
      const deduped = merged.filter((e) => {
        if (seen.has(e.id)) return false;
        seen.add(e.id);
        return true;
      });

      setEntries(deduped);
    } catch {
      // Silently handle — empty state will show
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  async function handleRevert(revisionId: string) {
    setReverting(revisionId);
    try {
      await window.mcpGateway.revertRevision({ revisionId });
      await loadData();
    } catch {
      // Toast would go here
    } finally {
      setReverting(null);
    }
  }

  const grouped = groupByDate(entries);

  return (
    <>
      <PageHeader
        title="Activity"
        actions={
          <Button onClick={loadData} disabled={loading}>
            {loading ? "Loading..." : "Refresh"}
          </Button>
        }
      />
      <div className="main-content">
        {entries.length === 0 && !loading ? (
          <EmptyState
            icon="◷"
            title="No activity yet"
            description="Sync operations, settings changes, and assistant analyses will appear here."
          />
        ) : (
          [...grouped.entries()].map(([dateLabel, items]) => (
            <section key={dateLabel} className="section">
              <h3 className="section-title">{dateLabel}</h3>
              <div style={{ display: "flex", flexDirection: "column" }}>
                {items.map((entry) => (
                  <div
                    key={entry.id}
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: "var(--space-3)",
                      padding: "var(--space-3) 0",
                      borderBottom: "1px solid var(--border)"
                    }}
                  >
                    <span
                      style={{
                        flexShrink: 0,
                        width: 48,
                        fontSize: "var(--text-xs)",
                        color: "var(--text-muted)",
                        textAlign: "right",
                        paddingTop: 1
                      }}
                    >
                      {formatTime(entry.timestamp)}
                    </span>
                    <span style={{ flexShrink: 0, fontSize: "var(--text-md)" }}>
                      {typeIcon(entry.type)}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: "var(--text-base)", fontWeight: 450 }}>
                        {entry.title}
                      </div>
                      {entry.detail && (
                        <div
                          style={{
                            fontSize: "var(--text-sm)",
                            color: "var(--text-muted)",
                            marginTop: 2
                          }}
                        >
                          {entry.detail}
                        </div>
                      )}
                    </div>
                    {entry.revisionId && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleRevert(entry.revisionId!)}
                        disabled={reverting === entry.revisionId}
                      >
                        {reverting === entry.revisionId ? "Reverting..." : "Revert"}
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </section>
          ))
        )}
      </div>
    </>
  );
}
