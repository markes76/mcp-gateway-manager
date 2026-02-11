import os from "node:os";
import path from "node:path";

import { JsonPlatformAdapter } from "../json-adapter";

export function claudeDefaultConfigCandidates(homeDir: string = os.homedir()): string[] {
  return [
    path.join(homeDir, "Library", "Application Support", "Claude", "claude_desktop_config.json"),
    path.join(homeDir, "Library", "Application Support", "Claude", "mcp.json"),
    path.join(homeDir, ".claude", "mcp.json"),
    path.join(homeDir, ".config", "claude", "mcp.json")
  ];
}

export function createClaudeAdapter(homeDir: string = os.homedir()): JsonPlatformAdapter {
  return new JsonPlatformAdapter({
    platform: "claude",
    defaultCandidates: () => claudeDefaultConfigCandidates(homeDir)
  });
}
