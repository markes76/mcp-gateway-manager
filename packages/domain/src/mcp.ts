export interface MCPServerDefinition {
  command: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
  enabled?: boolean;
}

export interface PlatformMcpConfig {
  mcpServers: Record<string, MCPServerDefinition>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function hasStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function hasStringRecord(value: unknown): value is Record<string, string> {
  if (!isRecord(value)) {
    return false;
  }

  return Object.values(value).every((entry) => typeof entry === "string");
}

export function validatePlatformMcpConfig(value: unknown): string[] {
  if (!isRecord(value)) {
    return ["Config must be an object."];
  }

  if (!isRecord(value.mcpServers)) {
    return ["Config must include an object field named 'mcpServers'."];
  }

  const errors: string[] = [];

  for (const [serverName, serverValue] of Object.entries(value.mcpServers)) {
    if (!isRecord(serverValue)) {
      errors.push(`Server '${serverName}' must be an object.`);
      continue;
    }

    if (typeof serverValue.command !== "string" || serverValue.command.length === 0) {
      errors.push(`Server '${serverName}' requires a non-empty string 'command'.`);
    }

    if (serverValue.args !== undefined && !hasStringArray(serverValue.args)) {
      errors.push(`Server '${serverName}' field 'args' must be a string array when provided.`);
    }

    if (serverValue.env !== undefined && !hasStringRecord(serverValue.env)) {
      errors.push(`Server '${serverName}' field 'env' must be a string record when provided.`);
    }

    if (serverValue.cwd !== undefined && typeof serverValue.cwd !== "string") {
      errors.push(`Server '${serverName}' field 'cwd' must be a string when provided.`);
    }

    if (serverValue.enabled !== undefined && typeof serverValue.enabled !== "boolean") {
      errors.push(`Server '${serverName}' field 'enabled' must be a boolean when provided.`);
    }
  }

  return errors;
}

export function isPlatformMcpConfig(value: unknown): value is PlatformMcpConfig {
  return validatePlatformMcpConfig(value).length === 0;
}
