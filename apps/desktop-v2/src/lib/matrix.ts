// Re-export from old desktop lib — identical logic, no changes needed
import type { MCPServerDefinition } from "@mcp-gateway/domain";
import type {
  GatewayStateResponse,
  MatrixPolicyInput,
  SupportedPlatform,
  SyncRequestPayload
} from "@mcp-gateway/ipc-contracts";

export const SUPPORTED_PLATFORMS: SupportedPlatform[] = ["claude", "cursor", "codex"];

function cloneDefinition(definition: MCPServerDefinition): MCPServerDefinition {
  return {
    ...definition,
    args: definition.args ? [...definition.args] : undefined,
    env: definition.env ? { ...definition.env } : undefined
  };
}

function buildEmptyEnabledMap(): Record<SupportedPlatform, boolean> {
  return { claude: false, cursor: false, codex: false };
}

function getReferenceDefinition(policy: MatrixPolicyInput): MCPServerDefinition | null {
  for (const p of SUPPORTED_PLATFORMS) {
    const def = policy.platformDefinitions[p];
    if (def) return cloneDefinition(def);
  }
  return null;
}

function buildDefaultDefinition(name: string): MCPServerDefinition {
  return { command: "npx", args: ["-y", name], enabled: true };
}

function recomputeGlobalEnabled(policy: MatrixPolicyInput): boolean {
  return SUPPORTED_PLATFORMS.some(
    (p) => hasPlatformDefinition(policy, p) && policy.platformEnabled[p]
  );
}

export function derivePoliciesFromState(state: GatewayStateResponse): MatrixPolicyInput[] {
  const names = new Set<string>();
  for (const snap of state.platforms) {
    for (const name of Object.keys(snap.servers)) names.add(name);
  }

  return [...names].sort().map((serverName) => {
    const platformEnabled = buildEmptyEnabledMap();
    const platformDefinitions: Partial<Record<SupportedPlatform, MCPServerDefinition>> = {};

    for (const p of SUPPORTED_PLATFORMS) {
      const snap = state.platforms.find((s) => s.platform === p);
      const def = snap?.servers[serverName];
      if (!def) continue;
      platformDefinitions[p] = cloneDefinition(def);
      platformEnabled[p] = def.enabled ?? true;
    }

    const globalEnabled = SUPPORTED_PLATFORMS.some(
      (p) => platformDefinitions[p] !== undefined && platformEnabled[p]
    );

    return { name: serverName, globalEnabled, platformEnabled, platformDefinitions };
  });
}

export function hasPlatformDefinition(
  policy: MatrixPolicyInput,
  platform: SupportedPlatform
): boolean {
  return policy.platformDefinitions[platform] !== undefined;
}

export function isPolicySharedAcrossPlatforms(policy: MatrixPolicyInput): boolean {
  const ref = getReferenceDefinition(policy);
  if (!ref) return false;
  const norm = JSON.stringify(ref);
  return SUPPORTED_PLATFORMS.every((p) => {
    const def = policy.platformDefinitions[p];
    return def && JSON.stringify(def) === norm;
  });
}

export function addPolicyDefinitionForPlatform(
  policy: MatrixPolicyInput,
  platform: SupportedPlatform
): MatrixPolicyInput {
  if (hasPlatformDefinition(policy, platform)) return policy;
  const ref = getReferenceDefinition(policy) ?? buildDefaultDefinition(policy.name);
  const next: MatrixPolicyInput = {
    ...policy,
    platformDefinitions: { ...policy.platformDefinitions, [platform]: cloneDefinition(ref) },
    platformEnabled: { ...policy.platformEnabled, [platform]: policy.globalEnabled }
  };
  return { ...next, globalEnabled: recomputeGlobalEnabled(next) };
}

export function removePolicyDefinitionForPlatform(
  policy: MatrixPolicyInput,
  platform: SupportedPlatform
): MatrixPolicyInput | null {
  if (!hasPlatformDefinition(policy, platform)) return policy;
  const defs = { ...policy.platformDefinitions };
  delete defs[platform];
  const remaining = Object.values(defs).filter(Boolean);
  if (remaining.length === 0) return null;
  const next: MatrixPolicyInput = {
    ...policy,
    platformDefinitions: defs,
    platformEnabled: { ...policy.platformEnabled, [platform]: false }
  };
  return { ...next, globalEnabled: recomputeGlobalEnabled(next) };
}

export function sharePolicyAcrossAllPlatforms(policy: MatrixPolicyInput): MatrixPolicyInput {
  const ref = getReferenceDefinition(policy) ?? buildDefaultDefinition(policy.name);
  const defs: Partial<Record<SupportedPlatform, MCPServerDefinition>> = {};
  const enabled = { ...policy.platformEnabled };
  for (const p of SUPPORTED_PLATFORMS) {
    defs[p] = cloneDefinition(ref);
    if (!hasPlatformDefinition(policy, p)) enabled[p] = policy.globalEnabled;
  }
  const next: MatrixPolicyInput = {
    ...policy,
    platformDefinitions: defs,
    platformEnabled: enabled
  };
  return { ...next, globalEnabled: recomputeGlobalEnabled(next) };
}

export function buildSyncRequestPayload(
  policies: MatrixPolicyInput[],
  state: GatewayStateResponse
): SyncRequestPayload {
  const pathMap: Record<SupportedPlatform, string> = { claude: "", cursor: "", codex: "" };
  for (const p of SUPPORTED_PLATFORMS) {
    const snap = state.platforms.find((s) => s.platform === p);
    pathMap[p] = snap?.configPath ?? "";
  }
  return { policies, platformConfigPaths: pathMap };
}
