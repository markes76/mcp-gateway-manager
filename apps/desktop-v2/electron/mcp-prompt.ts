/**
 * System prompt and JSON schema for local LLM MCP config extraction.
 * Used by LocalLlmProvider to produce grammar-constrained output.
 */

export const MCP_EXTRACTION_SYSTEM_PROMPT = `You are an MCP server configuration assistant embedded in a desktop app.

Given a user's input (URL, package name, or description) and optionally a README excerpt, extract the correct MCP server configuration as JSON.

Rules:
- suggestedName: lowercase kebab-case server identifier (e.g. "filesystem", "tavily-search")
- suggestedCommand: the exact runtime command (npx, node, python, uvx, docker, etc.)
- suggestedArgs: array of arguments exactly as they should appear on the command line
- requiredEnvVars: ALL environment variables mentioned in the documentation
- summary: one sentence describing what this MCP server does

Conventions:
- For npm packages: use "npx" with args ["-y", "<package-name>"]
- For Python packages on PyPI: use "uvx" with args ["<package-name>"]
- For Docker images: use "docker" with args ["run", "-i", "--rm", "<image>"]
- For local scripts: use "node" or "python" with the script path
- If the README shows a specific command, use that exact command
- Do not invent environment variables not mentioned in the documentation`;

export const MCP_CONFIG_JSON_SCHEMA = {
  type: "object" as const,
  properties: {
    suggestedName: { type: "string" as const },
    suggestedCommand: { type: "string" as const },
    suggestedArgs: {
      type: "array" as const,
      items: { type: "string" as const }
    },
    requiredEnvVars: {
      type: "array" as const,
      items: {
        type: "object" as const,
        properties: {
          name: { type: "string" as const },
          required: { type: "boolean" as const },
          description: { type: "string" as const }
        },
        required: ["name", "required", "description"] as const
      }
    },
    summary: { type: "string" as const }
  },
  required: [
    "suggestedName",
    "suggestedCommand",
    "suggestedArgs",
    "requiredEnvVars",
    "summary"
  ] as const
};

export function buildUserPrompt(
  input: string,
  docsExcerpt: string | null
): string {
  const parts = [`User input: ${input}`];

  if (docsExcerpt && docsExcerpt.length > 0) {
    parts.push(`\nDocumentation excerpt:\n${docsExcerpt}`);
  } else {
    parts.push("\nNo documentation available. Use your best judgment based on the input.");
  }

  parts.push("\nRespond with the JSON configuration only.");
  return parts.join("\n");
}
