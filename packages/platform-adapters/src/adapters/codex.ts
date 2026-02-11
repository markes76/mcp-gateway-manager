import os from "node:os";
import path from "node:path";

import { JsonPlatformAdapter } from "../json-adapter";

export function codexDefaultConfigCandidates(homeDir: string = os.homedir()): string[] {
  return [
    path.join(homeDir, ".codex", "mcp.json"),
    path.join(homeDir, ".config", "codex", "mcp.json"),
    path.join(homeDir, "Library", "Application Support", "Codex", "mcp.json")
  ];
}

export function createCodexAdapter(homeDir: string = os.homedir()): JsonPlatformAdapter {
  return new JsonPlatformAdapter({
    platform: "codex",
    defaultCandidates: () => codexDefaultConfigCandidates(homeDir)
  });
}
