import { describe, expect, it } from "vitest";

import type { GatewayStateResponse } from "@mcp-gateway/ipc-contracts";

import {
  addPolicyDefinitionForPlatform,
  buildSyncRequestPayload,
  derivePoliciesFromState,
  hasPlatformDefinition,
  isPolicySharedAcrossPlatforms,
  removePolicyDefinitionForPlatform,
  sharePolicyAcrossAllPlatforms
} from "../lib/matrix";

const stateFixture: GatewayStateResponse = {
  lastAppliedAt: null,
  platforms: [
    {
      platform: "claude",
      found: true,
      configPath: "/tmp/claude.json",
      servers: {
        filesystem: {
          command: "node",
          args: ["fs.js"],
          enabled: true
        }
      }
    },
    {
      platform: "cursor",
      found: true,
      configPath: "/tmp/cursor.json",
      servers: {
        filesystem: {
          command: "node",
          args: ["fs.js"],
          enabled: false
        },
        fetch: {
          command: "node",
          args: ["fetch.js"],
          enabled: true
        }
      }
    },
    {
      platform: "codex",
      found: false,
      configPath: "/tmp/codex.json",
      servers: {}
    }
  ]
};

describe("matrix helpers", () => {
  it("derives policy rows from platform snapshots", () => {
    const policies = derivePoliciesFromState(stateFixture);
    const fetchPolicy = policies.find((policy) => policy.name === "fetch");
    const filesystemPolicy = policies.find((policy) => policy.name === "filesystem");

    expect(policies.map((policy) => policy.name)).toEqual(["fetch", "filesystem"]);
    expect(fetchPolicy).toBeDefined();
    expect(filesystemPolicy).toBeDefined();
    expect(fetchPolicy?.platformEnabled.cursor).toBe(true);
    expect(fetchPolicy ? hasPlatformDefinition(fetchPolicy, "claude") : true).toBe(false);
    expect(filesystemPolicy?.platformEnabled.cursor).toBe(false);
    expect(filesystemPolicy?.globalEnabled).toBe(true);
  });

  it("builds sync request payload with platform config paths", () => {
    const policies = derivePoliciesFromState(stateFixture);
    const payload = buildSyncRequestPayload(policies, stateFixture);

    expect(payload.platformConfigPaths).toEqual({
      claude: "/tmp/claude.json",
      cursor: "/tmp/cursor.json",
      codex: "/tmp/codex.json"
    });
    expect(payload.policies).toHaveLength(2);
  });

  it("adds and removes per-platform definitions", () => {
    const policies = derivePoliciesFromState(stateFixture);
    const fetchPolicy = policies.find((policy) => policy.name === "fetch");
    expect(fetchPolicy).toBeDefined();

    const withClaude = fetchPolicy
      ? addPolicyDefinitionForPlatform(fetchPolicy, "claude")
      : undefined;

    expect(withClaude).toBeDefined();
    expect(withClaude ? hasPlatformDefinition(withClaude, "claude") : false).toBe(true);

    const removedCursor = withClaude
      ? removePolicyDefinitionForPlatform(withClaude, "cursor")
      : undefined;

    expect(removedCursor).toBeDefined();
    expect(removedCursor ? hasPlatformDefinition(removedCursor, "cursor") : true).toBe(false);
  });

  it("shares a policy definition across all platforms", () => {
    const policies = derivePoliciesFromState(stateFixture);
    const filesystemPolicy = policies.find((policy) => policy.name === "filesystem");
    expect(filesystemPolicy).toBeDefined();

    const shared = filesystemPolicy
      ? sharePolicyAcrossAllPlatforms(filesystemPolicy)
      : undefined;

    expect(shared).toBeDefined();
    expect(shared ? isPolicySharedAcrossPlatforms(shared) : false).toBe(true);
    expect(shared ? hasPlatformDefinition(shared, "codex") : false).toBe(true);
  });
});
