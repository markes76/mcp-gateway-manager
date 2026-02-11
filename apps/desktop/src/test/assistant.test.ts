import { describe, expect, it } from "vitest";

import { buildPolicyFromAssistantInput } from "../lib/assistant";

describe("assistant helpers", () => {
  it("builds selected-platform policy payload", () => {
    const policy = buildPolicyFromAssistantInput({
      name: "Filesystem",
      command: "npx",
      argsText: "-y @mcp/fs-server",
      enabled: true,
      scope: "selected",
      selectedPlatforms: {
        claude: true,
        cursor: false,
        codex: true
      }
    });

    expect(policy.name).toBe("filesystem");
    expect(policy.platformDefinitions.claude?.command).toBe("npx");
    expect(policy.platformDefinitions.cursor).toBeUndefined();
    expect(policy.platformEnabled.codex).toBe(true);
  });

  it("persists non-empty env values into platform definitions", () => {
    const policy = buildPolicyFromAssistantInput({
      name: "Tavily",
      command: "npx",
      argsText: "-y tavily-mcp",
      enabled: true,
      envValues: {
        TAVILY_API_KEY: "tvly-test",
        EMPTY_VALUE: "   "
      },
      scope: "all",
      selectedPlatforms: {
        claude: true,
        cursor: true,
        codex: true
      }
    });

    expect(policy.platformDefinitions.claude?.env).toEqual({
      TAVILY_API_KEY: "tvly-test"
    });
  });
});
