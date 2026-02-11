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
  return {
    claude: false,
    cursor: false,
    codex: false
  };
}

function getReferenceDefinition(policy: MatrixPolicyInput): MCPServerDefinition | null {
  for (const platform of SUPPORTED_PLATFORMS) {
    const definition = policy.platformDefinitions[platform];
    if (definition) {
      return cloneDefinition(definition);
    }
  }

  return null;
}

function buildDefaultDefinition(policyName: string): MCPServerDefinition {
  return {
    command: "npx",
    args: ["-y", policyName],
    enabled: true
  };
}

function recomputeGlobalEnabled(policy: MatrixPolicyInput): boolean {
  return SUPPORTED_PLATFORMS.some((platform) => {
    return hasPlatformDefinition(policy, platform) && policy.platformEnabled[platform];
  });
}

export function derivePoliciesFromState(state: GatewayStateResponse): MatrixPolicyInput[] {
  const serverNames = new Set<string>();

  for (const snapshot of state.platforms) {
    for (const serverName of Object.keys(snapshot.servers)) {
      serverNames.add(serverName);
    }
  }

  const policies: MatrixPolicyInput[] = [];

  for (const serverName of [...serverNames].sort()) {
    const platformEnabled = buildEmptyEnabledMap();
    const platformDefinitions: Partial<Record<SupportedPlatform, MCPServerDefinition>> = {};

    for (const platform of SUPPORTED_PLATFORMS) {
      const snapshot = state.platforms.find((entry) => entry.platform === platform);
      const definition = snapshot?.servers[serverName];

      if (!definition) {
        continue;
      }

      platformDefinitions[platform] = cloneDefinition(definition);
      platformEnabled[platform] = definition.enabled ?? true;
    }

    const globalEnabled = SUPPORTED_PLATFORMS.some((platform) => {
      return platformDefinitions[platform] !== undefined && platformEnabled[platform];
    });

    policies.push({
      name: serverName,
      globalEnabled,
      platformEnabled,
      platformDefinitions
    });
  }

  return policies;
}

export function hasPlatformDefinition(
  policy: MatrixPolicyInput,
  platform: SupportedPlatform
): boolean {
  return policy.platformDefinitions[platform] !== undefined;
}

export function isPolicySharedAcrossPlatforms(policy: MatrixPolicyInput): boolean {
  const reference = getReferenceDefinition(policy);
  if (!reference) {
    return false;
  }

  const normalizedReference = JSON.stringify(reference);

  return SUPPORTED_PLATFORMS.every((platform) => {
    const definition = policy.platformDefinitions[platform];
    if (!definition) {
      return false;
    }

    return JSON.stringify(definition) === normalizedReference;
  });
}

export function addPolicyDefinitionForPlatform(
  policy: MatrixPolicyInput,
  platform: SupportedPlatform
): MatrixPolicyInput {
  if (hasPlatformDefinition(policy, platform)) {
    return policy;
  }

  const reference = getReferenceDefinition(policy) ?? buildDefaultDefinition(policy.name);
  const nextPolicy: MatrixPolicyInput = {
    ...policy,
    platformDefinitions: {
      ...policy.platformDefinitions,
      [platform]: cloneDefinition(reference)
    },
    platformEnabled: {
      ...policy.platformEnabled,
      [platform]: policy.globalEnabled
    }
  };

  return {
    ...nextPolicy,
    globalEnabled: recomputeGlobalEnabled(nextPolicy)
  };
}

export function removePolicyDefinitionForPlatform(
  policy: MatrixPolicyInput,
  platform: SupportedPlatform
): MatrixPolicyInput | null {
  if (!hasPlatformDefinition(policy, platform)) {
    return policy;
  }

  const nextDefinitions = { ...policy.platformDefinitions };
  delete nextDefinitions[platform];

  const remainingDefinitions = Object.values(nextDefinitions).filter(
    (definition): definition is MCPServerDefinition => definition !== undefined
  );

  if (remainingDefinitions.length === 0) {
    return null;
  }

  const nextPolicy: MatrixPolicyInput = {
    ...policy,
    platformDefinitions: nextDefinitions,
    platformEnabled: {
      ...policy.platformEnabled,
      [platform]: false
    }
  };

  return {
    ...nextPolicy,
    globalEnabled: recomputeGlobalEnabled(nextPolicy)
  };
}

export function sharePolicyAcrossAllPlatforms(policy: MatrixPolicyInput): MatrixPolicyInput {
  const reference = getReferenceDefinition(policy) ?? buildDefaultDefinition(policy.name);
  const platformDefinitions: Partial<Record<SupportedPlatform, MCPServerDefinition>> = {};
  const platformEnabled = { ...policy.platformEnabled };

  for (const platform of SUPPORTED_PLATFORMS) {
    platformDefinitions[platform] = cloneDefinition(reference);
    if (!hasPlatformDefinition(policy, platform)) {
      platformEnabled[platform] = policy.globalEnabled;
    }
  }

  const nextPolicy: MatrixPolicyInput = {
    ...policy,
    platformDefinitions,
    platformEnabled
  };

  return {
    ...nextPolicy,
    globalEnabled: recomputeGlobalEnabled(nextPolicy)
  };
}

export function buildSyncRequestPayload(
  policies: MatrixPolicyInput[],
  state: GatewayStateResponse
): SyncRequestPayload {
  const pathMap: Record<SupportedPlatform, string> = {
    claude: "",
    cursor: "",
    codex: ""
  };

  for (const platform of SUPPORTED_PLATFORMS) {
    const snapshot = state.platforms.find((entry) => entry.platform === platform);
    pathMap[platform] = snapshot?.configPath ?? "";
  }

  return {
    policies,
    platformConfigPaths: pathMap
  };
}
