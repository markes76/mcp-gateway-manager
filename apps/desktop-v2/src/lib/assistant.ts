import type { MCPServerDefinition } from "@mcp-gateway/domain";
import type { MatrixPolicyInput, SupportedPlatform } from "@mcp-gateway/ipc-contracts";

import { SUPPORTED_PLATFORMS } from "./matrix";

function sanitizeName(input: string): string {
  const sanitized = input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return sanitized.length > 0 ? sanitized : "mcp-server";
}

function cloneDefinition(def: MCPServerDefinition): MCPServerDefinition {
  return {
    ...def,
    args: def.args ? [...def.args] : undefined,
    env: def.env ? { ...def.env } : undefined
  };
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
  const args = params.argsText
    .trim()
    .split(/\s+/g)
    .filter((a) => a.length > 0);
  const env = Object.fromEntries(
    Object.entries(params.envValues ?? {}).filter(
      ([k, v]) => k.trim().length > 0 && v.trim().length > 0
    )
  );

  const base: MCPServerDefinition = {
    command: params.command.trim(),
    args: args.length > 0 ? args : undefined,
    env: Object.keys(env).length > 0 ? env : undefined,
    enabled: params.enabled
  };

  const defs: Partial<Record<SupportedPlatform, MCPServerDefinition>> = {};
  const enabled: Record<SupportedPlatform, boolean> = { claude: false, cursor: false, codex: false };

  for (const p of SUPPORTED_PLATFORMS) {
    if (params.scope === "all" || params.selectedPlatforms[p]) {
      defs[p] = cloneDefinition(base);
      enabled[p] = params.enabled;
    }
  }

  return { name, globalEnabled: params.enabled, platformEnabled: enabled, platformDefinitions: defs };
}
