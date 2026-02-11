import type { MCPServerDefinition, PlatformMcpConfig } from "@mcp-gateway/domain";
import type { PlatformName } from "@mcp-gateway/platform-adapters";

import {
  PLATFORM_ORDER,
  type ManagedMcpPolicy,
  type PlatformConfigState,
  type PlatformSyncPlan,
  type SyncOperation,
  type SyncPlan,
  type SyncPlanInput
} from "./models";

function cloneDefinition(definition: MCPServerDefinition): MCPServerDefinition {
  return {
    ...definition,
    args: definition.args ? [...definition.args] : undefined,
    env: definition.env ? { ...definition.env } : undefined
  };
}

function clonePlatformConfig(config: PlatformMcpConfig): PlatformMcpConfig {
  const mcpServers: Record<string, MCPServerDefinition> = {};

  for (const [name, definition] of Object.entries(config.mcpServers)) {
    mcpServers[name] = cloneDefinition(definition);
  }

  return { mcpServers };
}

function resolveDefinitionForPlatform(
  policy: ManagedMcpPolicy,
  platform: PlatformName
): MCPServerDefinition | null {
  const override = policy.platforms?.[platform];
  const base = policy.shared ? override?.definition ?? policy.definition : override?.definition;

  if (!base) {
    return null;
  }

  const enabled = policy.globalEnabled && (override?.enabled ?? true);

  return {
    ...cloneDefinition(base),
    enabled
  };
}

function buildDesiredState(input: SyncPlanInput): PlatformConfigState {
  const preserveUnmanaged = input.preserveUnmanaged ?? true;
  const desired: PlatformConfigState = {
    claude: { mcpServers: {} },
    cursor: { mcpServers: {} },
    codex: { mcpServers: {} }
  };

  const managedNames = new Set(input.policies.map((policy) => policy.name));

  for (const policy of input.policies) {
    for (const platform of PLATFORM_ORDER) {
      const resolved = resolveDefinitionForPlatform(policy, platform);
      if (!resolved) {
        continue;
      }

      desired[platform].mcpServers[policy.name] = resolved;
    }
  }

  if (preserveUnmanaged) {
    for (const platform of PLATFORM_ORDER) {
      const currentServers = input.currentState[platform].mcpServers;
      for (const [name, definition] of Object.entries(currentServers)) {
        if (!managedNames.has(name) && desired[platform].mcpServers[name] === undefined) {
          desired[platform].mcpServers[name] = cloneDefinition(definition);
        }
      }
    }
  }

  return desired;
}

function sameDefinition(
  a: MCPServerDefinition | null | undefined,
  b: MCPServerDefinition | null | undefined
): boolean {
  if (!a && !b) {
    return true;
  }

  if (!a || !b) {
    return false;
  }

  return JSON.stringify(a) === JSON.stringify(b);
}

function diffConfigs(current: PlatformMcpConfig, next: PlatformMcpConfig): SyncOperation[] {
  const names = new Set<string>([
    ...Object.keys(current.mcpServers),
    ...Object.keys(next.mcpServers)
  ]);

  const operations: SyncOperation[] = [];

  for (const name of [...names].sort()) {
    const before = current.mcpServers[name] ?? null;
    const after = next.mcpServers[name] ?? null;

    if (sameDefinition(before, after)) {
      continue;
    }

    if (before === null && after !== null) {
      operations.push({ type: "add", serverName: name, before: null, after });
      continue;
    }

    if (before !== null && after === null) {
      operations.push({ type: "remove", serverName: name, before, after: null });
      continue;
    }

    operations.push({ type: "update", serverName: name, before, after });
  }

  return operations;
}

function buildPlatformPlan(
  platform: PlatformName,
  currentConfig: PlatformMcpConfig,
  nextConfig: PlatformMcpConfig,
  configPath: string
): PlatformSyncPlan {
  const operations = diffConfigs(currentConfig, nextConfig);

  return {
    platform,
    configPath,
    currentConfig: clonePlatformConfig(currentConfig),
    nextConfig: clonePlatformConfig(nextConfig),
    operations,
    hasChanges: operations.length > 0
  };
}

export function planSync(input: SyncPlanInput): SyncPlan {
  const desiredState = buildDesiredState(input);

  const byPlatform = {
    claude: buildPlatformPlan(
      "claude",
      input.currentState.claude,
      desiredState.claude,
      input.configPaths.claude
    ),
    cursor: buildPlatformPlan(
      "cursor",
      input.currentState.cursor,
      desiredState.cursor,
      input.configPaths.cursor
    ),
    codex: buildPlatformPlan(
      "codex",
      input.currentState.codex,
      desiredState.codex,
      input.configPaths.codex
    )
  };

  const totalOperations = PLATFORM_ORDER.reduce((sum, platform) => {
    return sum + byPlatform[platform].operations.length;
  }, 0);

  return {
    generatedAt: new Date().toISOString(),
    byPlatform,
    totalOperations
  };
}
