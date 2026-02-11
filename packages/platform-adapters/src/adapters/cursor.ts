import os from "node:os";
import path from "node:path";

import { JsonPlatformAdapter } from "../json-adapter";

export function cursorDefaultConfigCandidates(homeDir: string = os.homedir()): string[] {
  return [
    path.join(homeDir, ".cursor", "mcp.json"),
    path.join(homeDir, ".config", "cursor", "mcp.json"),
    path.join(homeDir, "Library", "Application Support", "Cursor", "User", "mcp.json")
  ];
}

export function createCursorAdapter(homeDir: string = os.homedir()): JsonPlatformAdapter {
  return new JsonPlatformAdapter({
    platform: "cursor",
    defaultCandidates: () => cursorDefaultConfigCandidates(homeDir)
  });
}
