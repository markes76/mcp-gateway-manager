import type { MCPServerDefinition, PlatformMcpConfig } from "@mcp-gateway/domain";
import type { PlatformAdapter, PlatformName } from "@mcp-gateway/platform-adapters";

export const PLATFORM_ORDER: PlatformName[] = ["claude", "cursor", "codex"];

export type AdapterMap = Record<PlatformName, PlatformAdapter>;

export interface PlatformOverride {
  enabled?: boolean;
  definition?: MCPServerDefinition;
}

export interface ManagedMcpPolicy {
  name: string;
  definition: MCPServerDefinition;
  shared: boolean;
  globalEnabled: boolean;
  platforms?: Partial<Record<PlatformName, PlatformOverride>>;
}

export type PlatformConfigState = Record<PlatformName, PlatformMcpConfig>;

export interface SyncPlanInput {
  currentState: PlatformConfigState;
  configPaths: Record<PlatformName, string>;
  policies: ManagedMcpPolicy[];
  preserveUnmanaged?: boolean;
}

export type SyncOperationType = "add" | "update" | "remove";

export interface SyncOperation {
  type: SyncOperationType;
  serverName: string;
  before: MCPServerDefinition | null;
  after: MCPServerDefinition | null;
}

export interface PlatformSyncPlan {
  platform: PlatformName;
  configPath: string;
  currentConfig: PlatformMcpConfig;
  nextConfig: PlatformMcpConfig;
  operations: SyncOperation[];
  hasChanges: boolean;
}

export interface SyncPlan {
  generatedAt: string;
  byPlatform: Record<PlatformName, PlatformSyncPlan>;
  totalOperations: number;
}

export interface AppliedOperation {
  platform: PlatformName;
  configPath: string;
  backupPath: string;
  operationCount: number;
  appliedAt: string;
}

export interface ApplySyncPlanOptions {
  journalPath?: string;
}

export interface ApplySyncPlanResult {
  appliedAt: string;
  operations: AppliedOperation[];
}

export interface SyncJournalEntry {
  timestamp: string;
  platform: PlatformName;
  configPath: string;
  backupPath: string;
  operationCount: number;
}
