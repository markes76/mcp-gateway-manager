import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import type { PlatformMcpConfig } from "@mcp-gateway/domain";
import {
  createClaudeAdapter,
  createCodexAdapter,
  createCursorAdapter,
  type PlatformAdapter
} from "@mcp-gateway/platform-adapters";
import { afterEach, describe, expect, it } from "vitest";

import { applySyncPlan, SyncApplyError } from "../src/apply";
import { type AdapterMap, type ManagedMcpPolicy, type PlatformConfigState } from "../src/models";
import { planSync } from "../src/plan";

const tempRoots: string[] = [];

async function createTempRoot(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "mcp-sync-engine-"));
  tempRoots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(tempRoots.map((root) => rm(root, { recursive: true, force: true })));
  tempRoots.length = 0;
});

function emptyState(): PlatformConfigState {
  return {
    claude: { mcpServers: {} },
    cursor: { mcpServers: {} },
    codex: { mcpServers: {} }
  };
}

function buildConfigPaths(root: string): Record<"claude" | "cursor" | "codex", string> {
  return {
    claude: path.join(root, "claude.json"),
    cursor: path.join(root, "cursor.json"),
    codex: path.join(root, "codex.json")
  };
}

function buildAdapters(homeDir: string): AdapterMap {
  return {
    claude: createClaudeAdapter(homeDir),
    cursor: createCursorAdapter(homeDir),
    codex: createCodexAdapter(homeDir)
  };
}

async function writeConfig(filePath: string, config: PlatformMcpConfig): Promise<void> {
  await writeFile(filePath, JSON.stringify(config, null, 2), "utf8");
}

describe("sync-engine", () => {
  it("builds a diff preview including per-platform enable overrides", () => {
    const current = emptyState();
    current.claude.mcpServers.legacy = { command: "python", args: ["legacy.py"] };

    const policies: ManagedMcpPolicy[] = [
      {
        name: "localTime",
        shared: true,
        globalEnabled: true,
        definition: {
          command: "node",
          args: ["time-server.js"]
        },
        platforms: {
          cursor: {
            enabled: false
          }
        }
      }
    ];

    const plan = planSync({
      currentState: current,
      configPaths: {
        claude: "/tmp/claude.json",
        cursor: "/tmp/cursor.json",
        codex: "/tmp/codex.json"
      },
      policies
    });

    expect(plan.totalOperations).toBe(3);
    expect(plan.byPlatform.claude.operations[0]).toMatchObject({
      type: "add",
      serverName: "localTime",
      after: {
        command: "node",
        args: ["time-server.js"],
        enabled: true
      }
    });
    expect(plan.byPlatform.cursor.operations[0]).toMatchObject({
      type: "add",
      serverName: "localTime",
      after: {
        command: "node",
        args: ["time-server.js"],
        enabled: false
      }
    });
    expect(plan.byPlatform.codex.operations[0]).toMatchObject({
      type: "add",
      serverName: "localTime"
    });
  });

  it("applies a plan and writes sync journal entries", async () => {
    const root = await createTempRoot();
    const paths = buildConfigPaths(root);
    const adapters = buildAdapters(root);

    const current = emptyState();

    await writeConfig(paths.claude, current.claude);
    await writeConfig(paths.cursor, current.cursor);
    await writeConfig(paths.codex, current.codex);

    const plan = planSync({
      currentState: current,
      configPaths: paths,
      policies: [
        {
          name: "filesystem",
          shared: true,
          globalEnabled: true,
          definition: {
            command: "node",
            args: ["fs-server.js"]
          }
        }
      ]
    });

    const journalPath = path.join(root, "sync-journal.jsonl");
    const result = await applySyncPlan(plan, adapters, { journalPath });

    expect(result.operations).toHaveLength(3);

    const claudeConfig = JSON.parse(await readFile(paths.claude, "utf8")) as PlatformMcpConfig;
    expect(claudeConfig.mcpServers.filesystem).toMatchObject({
      command: "node",
      enabled: true
    });

    const journalLines = (await readFile(journalPath, "utf8"))
      .trim()
      .split("\n")
      .filter((line) => line.length > 0);

    expect(journalLines).toHaveLength(3);
  });

  it("rolls back previous writes when a later platform apply fails", async () => {
    const root = await createTempRoot();
    const paths = buildConfigPaths(root);

    const initialClaude: PlatformMcpConfig = {
      mcpServers: {
        sharedTool: {
          command: "node",
          args: ["old.js"],
          enabled: true
        }
      }
    };

    const initialCursor: PlatformMcpConfig = {
      mcpServers: {
        sharedTool: {
          command: "node",
          args: ["old.js"],
          enabled: true
        }
      }
    };

    const initialCodex: PlatformMcpConfig = { mcpServers: {} };

    await writeConfig(paths.claude, initialClaude);
    await writeConfig(paths.cursor, initialCursor);
    await writeConfig(paths.codex, initialCodex);

    const plan = planSync({
      currentState: {
        claude: initialClaude,
        cursor: initialCursor,
        codex: initialCodex
      },
      configPaths: paths,
      policies: [
        {
          name: "sharedTool",
          shared: true,
          globalEnabled: true,
          definition: {
            command: "node",
            args: ["new.js"]
          }
        }
      ]
    });

    const adapters = buildAdapters(root);
    const cursorBaseAdapter = adapters.cursor;

    const failingCursorAdapter: PlatformAdapter = {
      platform: cursorBaseAdapter.platform,
      defaultConfigCandidates: () => cursorBaseAdapter.defaultConfigCandidates(),
      detect: (options) => cursorBaseAdapter.detect(options),
      read: (configPath) => cursorBaseAdapter.read(configPath),
      validate: (config) => cursorBaseAdapter.validate(config),
      backup: (configPath) => cursorBaseAdapter.backup(configPath),
      writeAtomic: async () => {
        throw new Error("Simulated cursor write failure");
      }
    };

    const adaptersWithFailure: AdapterMap = {
      ...adapters,
      cursor: failingCursorAdapter
    };

    await expect(applySyncPlan(plan, adaptersWithFailure)).rejects.toBeInstanceOf(SyncApplyError);

    const claudeAfterFailure = JSON.parse(await readFile(paths.claude, "utf8")) as PlatformMcpConfig;
    expect(claudeAfterFailure).toEqual(initialClaude);
  });
});
