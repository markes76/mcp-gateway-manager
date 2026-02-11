import { createClaudeAdapter } from "./adapters/claude";
import { createCodexAdapter } from "./adapters/codex";
import { createCursorAdapter } from "./adapters/cursor";
import type { DetectResult, PlatformName } from "./types";

interface DiscoveryOptions {
  homeDir?: string;
  overridePaths?: Partial<Record<PlatformName, string[]>>;
}

export async function discoverPlatformConfigs(options?: DiscoveryOptions): Promise<DetectResult[]> {
  const adapters = [
    createClaudeAdapter(options?.homeDir),
    createCursorAdapter(options?.homeDir),
    createCodexAdapter(options?.homeDir)
  ];

  return Promise.all(
    adapters.map((adapter) =>
      adapter.detect({
        overridePaths: options?.overridePaths?.[adapter.platform]
      })
    )
  );
}
