import { describe, expect, it } from "vitest";

import { isPlatformMcpConfig, validatePlatformMcpConfig } from "../src/mcp";

describe("validatePlatformMcpConfig", () => {
  it("accepts valid MCP config", () => {
    const validConfig = {
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

    expect(validatePlatformMcpConfig(validConfig)).toEqual([]);
    expect(isPlatformMcpConfig(validConfig)).toBe(true);
  });

  it("returns structured errors for invalid config", () => {
    const invalidConfig = {
      mcpServers: {
        broken: {
          command: "",
          args: ["ok", 42]
        }
      }
    };

    expect(validatePlatformMcpConfig(invalidConfig)).toEqual([
      "Server 'broken' requires a non-empty string 'command'.",
      "Server 'broken' field 'args' must be a string array when provided."
    ]);
    expect(isPlatformMcpConfig(invalidConfig)).toBe(false);
  });
});
