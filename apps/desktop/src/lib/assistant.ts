import type { MCPServerDefinition } from "@mcp-gateway/domain";
import type { MatrixPolicyInput, SupportedPlatform } from "@mcp-gateway/ipc-contracts";

import { SUPPORTED_PLATFORMS } from "./matrix";

function sanitizeName(input: string): string {
  const trimmed = input.trim().toLowerCase();
  const sanitized = trimmed.replace(/[^a-z0-9-_]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");

  return sanitized.length > 0 ? sanitized : "mcp-server";
}

function cloneDefinition(definition: MCPServerDefinition): MCPServerDefinition {
  return {
    ...definition,
    args: definition.args ? [...definition.args] : undefined,
    env: definition.env ? { ...definition.env } : undefined
  };
}

function tokenizeArgs(input: string): string[] {
  const trimmed = input.trim();
  if (trimmed.length === 0) {
    return [];
  }

  return trimmed.split(/\s+/g);
}

export function buildPolicyFromAssistantInput(params: {
  name: string;
  command: string;
  argsText: string;
  enabled: boolean;
  envValues?: Record<string, string>;
  scope: "all" | "selected";
  selectedPlatforms: Record<SupportedPlatform, boolean>;
}): MatrixPolicyInput {
  const name = sanitizeName(params.name);
  const args = tokenizeArgs(params.argsText);
  const envEntries = Object.entries(params.envValues ?? {}).reduce<Record<string, string>>(
    (accumulator, [nameValue, rawValue]) => {
      const key = nameValue.trim();
      const value = rawValue.trim();

      if (key.length === 0 || value.length === 0) {
        return accumulator;
      }

      accumulator[key] = value;
      return accumulator;
    },
    {}
  );

  const baseDefinition: MCPServerDefinition = {
    command: params.command.trim(),
    args: args.length > 0 ? args : undefined,
    env: Object.keys(envEntries).length > 0 ? envEntries : undefined,
    enabled: params.enabled
  };

  const platformDefinitions: Partial<Record<SupportedPlatform, MCPServerDefinition>> = {};
  const platformEnabled: Record<SupportedPlatform, boolean> = {
    claude: false,
    cursor: false,
    codex: false
  };

  for (const platform of SUPPORTED_PLATFORMS) {
    const includePlatform =
      params.scope === "all" ? true : params.selectedPlatforms[platform] === true;

    if (!includePlatform) {
      continue;
    }

    platformDefinitions[platform] = cloneDefinition(baseDefinition);
    platformEnabled[platform] = params.enabled;
  }

  return {
    name,
    globalEnabled: params.enabled,
    platformEnabled,
    platformDefinitions
  };
}
