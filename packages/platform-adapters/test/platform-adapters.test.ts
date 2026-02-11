import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import type { PlatformMcpConfig } from "@mcp-gateway/domain";
import { afterEach, describe, expect, it } from "vitest";

import { createClaudeAdapter } from "../src/adapters/claude";
import { createCursorAdapter } from "../src/adapters/cursor";

const validConfig: PlatformMcpConfig = {
  mcpServers: {
    localTime: {
      command: "node",
      args: ["server.js"],
      env: {
        TZ: "UTC"
      },
      enabled: true
    }
  }
};

const tempRoots: string[] = [];

async function createTempRoot(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "mcp-adapters-"));
  tempRoots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(tempRoots.map((root) => rm(root, { recursive: true, force: true })));
  tempRoots.length = 0;
});

describe("platform adapters", () => {
  it("returns found=false when no candidate files exist", async () => {
    const tempRoot = await createTempRoot();
    const adapter = createClaudeAdapter(tempRoot);
    const missingPath = path.join(tempRoot, "not-here.json");

    const result = await adapter.detect({ overridePaths: [missingPath] });

    expect(result.found).toBe(false);
    expect(result.path).toBeNull();
    expect(result.searchedPaths).toEqual([missingPath]);
  });

  it("throws MALFORMED_JSON when config parsing fails", async () => {
    const tempRoot = await createTempRoot();
    const adapter = createClaudeAdapter(tempRoot);
    const configPath = path.join(tempRoot, "claude.json");

    await writeFile(configPath, "{\"mcpServers\":", "utf8");

    await expect(adapter.read(configPath)).rejects.toMatchObject({
      code: "MALFORMED_JSON"
    });
  });

  it("throws FILE_NOT_FOUND when backup source is missing", async () => {
    const tempRoot = await createTempRoot();
    const adapter = createClaudeAdapter(tempRoot);
    const missingPath = path.join(tempRoot, "missing.json");

    await expect(adapter.backup(missingPath)).rejects.toMatchObject({
      code: "FILE_NOT_FOUND"
    });
  });

  it("writes config atomically with no leftover temp files", async () => {
    const tempRoot = await createTempRoot();
    const adapter = createCursorAdapter(tempRoot);
    const configPath = path.join(tempRoot, "cursor.json");

    await adapter.writeAtomic(configPath, validConfig);

    const writtenRaw = await readFile(configPath, "utf8");
    expect(JSON.parse(writtenRaw)).toEqual(validConfig);

    const files = await readdir(tempRoot);
    expect(files.some((fileName) => fileName.endsWith(".tmp"))).toBe(false);
  });

  it("creates a timestamped backup for an existing config", async () => {
    const tempRoot = await createTempRoot();
    const adapter = createCursorAdapter(tempRoot);
    const configPath = path.join(tempRoot, "cursor.json");

    await writeFile(configPath, JSON.stringify(validConfig), "utf8");

    const backup = await adapter.backup(configPath);

    const backupRaw = await readFile(backup.backupPath, "utf8");
    expect(JSON.parse(backupRaw)).toEqual(validConfig);
    expect(backup.backupPath).toContain(".bak.");
  });
});
