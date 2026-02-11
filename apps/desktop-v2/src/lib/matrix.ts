import type { MCPServerDefinition } from "@mcp-gateway/domain";
import type {
  GatewayStateResponse,
  MatrixPolicyInput,
  SupportedPlatform,
  SyncRequestPayload
} from "@mcp-gateway/ipc-contracts";

export const SUPPORTED_PLATFORMS: SupportedPlatform[] = ["claude", "cursor", "codex"];

export function getAllPlatformIds(state: GatewayStateResponse): string[] {
  return state.platforms.map((s) => s.platform);
}

function cloneDefinition(definition: MCPServerDefinition): MCPServerDefinition {
  return {
    ...definition,
    args: definition.args ? [...definition.args] : undefined,
    env: definition.env ? { ...definition.env } : undefined
  };
}

function buildEmptyEnabledMap(platformIds: string[]): Record<string, boolean> {
  const map: Record<string, boolean> = {};
  for (const id of platformIds) {
    map[id] = false;
  }
  return map;
}

function getReferenceDefinition(policy: MatrixPolicyInput, platformIds: string[]): MCPServerDefinition | null {
  for (const p of platformIds) {
    const def = policy.platformDefinitions[p];
    if (def) return cloneDefinition(def);
  }
  return null;
}

function buildDefaultDefinition(name: string): MCPServerDefinition {
  return { command: "npx", args: ["-y", name], enabled: true };
}

function recomputeGlobalEnabled(policy: MatrixPolicyInput, platformIds: string[]): boolean {
  return platformIds.some(
    (p) => hasPlatformDefinition(policy, p) && policy.platformEnabled[p]
  );
}

export function derivePoliciesFromState(state: GatewayStateResponse): MatrixPolicyInput[] {
  const platformIds = getAllPlatformIds(state);
  const names = new Set<string>();
  for (const snap of state.platforms) {
    for (const name of Object.keys(snap.servers)) names.add(name);
  }

  return [...names].sort().map((serverName) => {
    const platformEnabled = buildEmptyEnabledMap(platformIds);
    const platformDefinitions: Partial<Record<string, MCPServerDefinition>> = {};

    for (const p of platformIds) {
      const snap = state.platforms.find((s) => s.platform === p);
      const def = snap?.servers[serverName];
      if (!def) continue;
      platformDefinitions[p] = cloneDefinition(def);
      platformEnabled[p] = def.enabled ?? true;
    }

    const globalEnabled = platformIds.some(
      (p) => platformDefinitions[p] !== undefined && platformEnabled[p]
    );

    return { name: serverName, globalEnabled, platformEnabled, platformDefinitions };
  });
}

export function hasPlatformDefinition(
  policy: MatrixPolicyInput,
  platform: string
): boolean {
  return policy.platformDefinitions[platform] !== undefined;
}

export function isPolicySharedAcrossPlatforms(policy: MatrixPolicyInput): boolean {
  const platformIds = Object.keys(policy.platformDefinitions);
  if (platformIds.length < 2) return false;
  const ref = policy.platformDefinitions[platformIds[0]!];
  if (!ref) return false;
  const norm = JSON.stringify(ref);
  return platformIds.every((p) => {
    const def = policy.platformDefinitions[p];
    return def && JSON.stringify(def) === norm;
  });
}

export function addPolicyDefinitionForPlatform(
  policy: MatrixPolicyInput,
  platform: string,
  allPlatformIds?: string[]
): MatrixPolicyInput {
  if (hasPlatformDefinition(policy, platform)) return policy;
  const ids = allPlatformIds ?? Object.keys(policy.platformDefinitions);
  const ref = getReferenceDefinition(policy, ids) ?? buildDefaultDefinition(policy.name);
  const next: MatrixPolicyInput = {
    ...policy,
    platformDefinitions: { ...policy.platformDefinitions, [platform]: cloneDefinition(ref) },
    platformEnabled: { ...policy.platformEnabled, [platform]: policy.globalEnabled }
  };
  return { ...next, globalEnabled: recomputeGlobalEnabled(next, ids.includes(platform) ? ids : [...ids, platform]) };
}

export function removePolicyDefinitionForPlatform(
  policy: MatrixPolicyInput,
  platform: string
): MatrixPolicyInput | null {
  if (!hasPlatformDefinition(policy, platform)) return policy;
  const defs = { ...policy.platformDefinitions };
  delete defs[platform];
  const remaining = Object.values(defs).filter(Boolean);
  if (remaining.length === 0) return null;
  const ids = Object.keys(defs);
  const next: MatrixPolicyInput = {
    ...policy,
    platformDefinitions: defs,
    platformEnabled: { ...policy.platformEnabled, [platform]: false }
  };
  return { ...next, globalEnabled: recomputeGlobalEnabled(next, ids) };
}

export function sharePolicyAcrossAllPlatforms(
  policy: MatrixPolicyInput,
  allPlatformIds: string[]
): MatrixPolicyInput {
  const ref = getReferenceDefinition(policy, allPlatformIds) ?? buildDefaultDefinition(policy.name);
  const defs: Partial<Record<string, MCPServerDefinition>> = {};
  const enabled = { ...policy.platformEnabled };
  for (const p of allPlatformIds) {
    defs[p] = cloneDefinition(ref);
    if (!hasPlatformDefinition(policy, p)) enabled[p] = policy.globalEnabled;
  }
  const next: MatrixPolicyInput = {
    ...policy,
    platformDefinitions: defs,
    platformEnabled: enabled
  };
  return { ...next, globalEnabled: recomputeGlobalEnabled(next, allPlatformIds) };
}

export function buildSyncRequestPayload(
  policies: MatrixPolicyInput[],
  state: GatewayStateResponse
): SyncRequestPayload {
  const pathMap: Record<string, string> = {};
  for (const snap of state.platforms) {
    pathMap[snap.platform] = snap.configPath ?? "";
  }
  return { policies, platformConfigPaths: pathMap };
}
