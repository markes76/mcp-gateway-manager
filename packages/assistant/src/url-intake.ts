import type { AssistantEnvVarHint, AssistantSourceKind, AssistantUrlSuggestion } from "./types";

function sanitizeName(input: string): string {
  const trimmed = input.trim().toLowerCase();
  const sanitized = trimmed.replace(/[^a-z0-9-_]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");

  return sanitized.length > 0 ? sanitized : "mcp-server";
}

function normalizePotentialUrl(input: string): string {
  const trimmed = input.trim();

  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return trimmed;
  }

  if (trimmed.startsWith("npm:")) {
    return `https://www.npmjs.com/package/${trimmed.slice(4)}`;
  }

  if (trimmed.startsWith("@") || /^[a-z0-9][a-z0-9._-]*$/i.test(trimmed)) {
    return `https://www.npmjs.com/package/${trimmed}`;
  }

  return trimmed;
}

function buildQuestions(sourceKind: AssistantSourceKind): Array<{ id: string; text: string }> {
  const questions: Array<{ id: string; text: string }> = [
    {
      id: "scope",
      text: "Should this MCP be added to all platforms or selected platforms only?"
    },
    {
      id: "enable-by-default",
      text: "Should this MCP be enabled by default after configuration?"
    }
  ];

  if (sourceKind === "manifest") {
    questions.unshift({
      id: "command",
      text: "Confirm the runtime command and working directory for this manifest-based MCP."
    });
  }

  return questions;
}

function inferEnvHints(input: string): AssistantEnvVarHint[] {
  const lower = input.toLowerCase();
  const hints: AssistantEnvVarHint[] = [];

  if (lower.includes("tavily")) {
    hints.push({
      name: "TAVILY_API_KEY",
      required: true,
      description: "API key for Tavily-powered search requests.",
      example: "tvly-..."
    });
  }

  if (lower.includes("openai")) {
    hints.push({
      name: "OPENAI_API_KEY",
      required: true,
      description: "API key for OpenAI requests."
    });
  }

  if (lower.includes("anthropic") || lower.includes("claude")) {
    hints.push({
      name: "ANTHROPIC_API_KEY",
      required: true,
      description: "API key for Anthropic Claude requests."
    });
  }

  return hints;
}

function buildInstallSteps(sourceKind: AssistantSourceKind, suggestedCommand: string, suggestedArgs: string[]): string[] {
  if (sourceKind === "manifest") {
    return [
      "Review manifest instructions and verify runtime paths.",
      "Ensure the server entrypoint exists locally before apply.",
      `Test command locally: ${suggestedCommand} ${suggestedArgs.join(" ")}`
    ];
  }

  return [
    `Validate command locally: ${suggestedCommand} ${suggestedArgs.join(" ")}`.trim(),
    "Use Preview Sync before apply to verify per-platform changes.",
    "Apply Sync and confirm backup files are created for touched configs."
  ];
}

function buildSuggestion(
  sourceKind: AssistantSourceKind,
  normalizedUrl: string,
  name: string,
  command: string,
  suggestedArgs: string[]
): AssistantUrlSuggestion {
  const envHints = inferEnvHints(`${normalizedUrl} ${name}`);

  return {
    provider: "heuristic-fallback",
    mode: "fallback",
    normalizedUrl,
    sourceKind,
    suggestedName: name,
    suggestedCommand: command,
    suggestedArgs,
    requiredEnvVars: envHints,
    installSteps: buildInstallSteps(sourceKind, command, suggestedArgs),
    docsContextUsed: false,
    questions: buildQuestions(sourceKind),
    summary: "Fallback parser generated suggestions because Codex Internal response was unavailable."
  };
}

export function inferSuggestionFromUrl(input: string): AssistantUrlSuggestion {
  const normalized = normalizePotentialUrl(input);

  try {
    const urlValue = new URL(normalized);
    const host = urlValue.hostname.toLowerCase();
    const pathSegments = urlValue.pathname.split("/").filter((segment) => segment.length > 0);

    if (host.includes("npmjs.com") && pathSegments[0] === "package") {
      const packageName = pathSegments.slice(1).join("/");
      const name = sanitizeName(packageName.split("/").pop() ?? packageName);
      return buildSuggestion("npm", urlValue.toString(), name, "npx", ["-y", packageName]);
    }

    if (host.includes("github.com") && pathSegments.length >= 2) {
      const owner = pathSegments[0] ?? "repo-owner";
      const repo = pathSegments[1] ?? "repo";
      return buildSuggestion("github", urlValue.toString(), sanitizeName(repo), "npx", ["-y", `${owner}/${repo}`]);
    }

    if (urlValue.pathname.endsWith(".json")) {
      const manifestName = sanitizeName(pathSegments[pathSegments.length - 1]?.replace(/\.json$/i, "") ?? "manifest");
      return buildSuggestion("manifest", urlValue.toString(), manifestName, "node", ["./server.js"]);
    }

    const fallback = sanitizeName(pathSegments[pathSegments.length - 1] ?? host);
    return buildSuggestion("generic", urlValue.toString(), fallback, "node", ["./server.js"]);
  } catch {
    const fallbackName = sanitizeName(input);
    return buildSuggestion("generic", input.trim(), fallbackName, "npx", ["-y", input.trim()]);
  }
}
