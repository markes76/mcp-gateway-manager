/**
 * LocalLlmProvider — replaces CodexInternalProvider.
 *
 * Two-layer approach:
 *   Layer 1: Deterministic URL parsing (always runs, instant)
 *   Layer 2: Local Qwen 2.5 1.5B enhancement (if model downloaded)
 *
 * Falls back gracefully if model is not available.
 */

import type {
  AssistantSuggestRequest,
  AssistantSuggestionResponse
} from "@mcp-gateway/ipc-contracts";

import { inferSuggestionFromUrl } from "@mcp-gateway/assistant";

import { buildUserPrompt, MCP_EXTRACTION_SYSTEM_PROMPT } from "./mcp-prompt.js";
import {
  ensureModelLoaded,
  getModelStatus,
  isModelLoaded,
  promptModel
} from "./model-manager.js";

/**
 * Fetch documentation from a URL for context.
 * Returns empty string on failure — never throws.
 */
async function fetchDocsExcerpt(input: string): Promise<string> {
  const trimmed = input.trim();

  // Only fetch if it looks like a URL
  if (!trimmed.startsWith("http://") && !trimmed.startsWith("https://")) {
    // Try to construct a URL for npm/github patterns
    let url: string | null = null;
    if (trimmed.startsWith("npm:")) {
      url = `https://www.npmjs.com/package/${trimmed.slice(4)}`;
    } else if (trimmed.startsWith("@") || /^[a-z0-9][a-z0-9._-]*$/i.test(trimmed)) {
      url = `https://www.npmjs.com/package/${trimmed}`;
    } else if (trimmed.includes("github.com")) {
      url = trimmed;
    }

    if (!url) return "";

    return fetchDocsExcerpt(url);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(trimmed, {
      method: "GET",
      headers: { "User-Agent": "MCP-Gateway-Manager/2.0" },
      signal: controller.signal
    });

    if (!response.ok) return "";

    const raw = await response.text();
    const cleaned = raw
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    return cleaned.slice(0, 5000);
  } catch {
    return "";
  } finally {
    clearTimeout(timer);
  }
}

interface LlmParsedConfig {
  suggestedName: string;
  suggestedCommand: string;
  suggestedArgs: string[];
  requiredEnvVars: Array<{
    name: string;
    required: boolean;
    description: string;
  }>;
  summary: string;
}

function parseLlmResponse(raw: string): LlmParsedConfig | null {
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;

    if (
      typeof parsed.suggestedName !== "string" ||
      typeof parsed.suggestedCommand !== "string" ||
      !Array.isArray(parsed.suggestedArgs) ||
      typeof parsed.summary !== "string"
    ) {
      return null;
    }

    return {
      suggestedName: parsed.suggestedName,
      suggestedCommand: parsed.suggestedCommand,
      suggestedArgs: parsed.suggestedArgs as string[],
      requiredEnvVars: Array.isArray(parsed.requiredEnvVars)
        ? (parsed.requiredEnvVars as LlmParsedConfig["requiredEnvVars"])
        : [],
      summary: parsed.summary
    };
  } catch {
    return null;
  }
}

export async function analyzeInput(
  payload: AssistantSuggestRequest
): Promise<AssistantSuggestionResponse> {
  const input = payload.input.trim();

  // Layer 1: Deterministic parsing (always runs)
  const baseSuggestion = inferSuggestionFromUrl(input);

  // Layer 2: Try local LLM enhancement
  const status = await getModelStatus();

  if (!status.downloaded) {
    return {
      ...baseSuggestion,
      provider: "heuristic-fallback",
      mode: "fallback",
      summary:
        baseSuggestion.summary ||
        "Generated using URL pattern matching. Download the AI model in Settings for smarter analysis."
    };
  }

  try {
    await ensureModelLoaded();

    const docsExcerpt = await fetchDocsExcerpt(input);
    const userPrompt = buildUserPrompt(input, docsExcerpt || null);

    const rawResponse = await promptModel(userPrompt);
    const llmResult = parseLlmResponse(rawResponse);

    if (!llmResult) {
      // LLM produced something but it didn't parse — fall back
      return {
        ...baseSuggestion,
        provider: "heuristic-fallback",
        mode: "fallback",
        summary: "AI analysis produced an unparseable result. Falling back to pattern matching."
      };
    }

    // Merge: LLM takes precedence, base fills gaps
    return {
      provider: "local-llm",
      mode: "live",
      normalizedUrl: baseSuggestion.normalizedUrl,
      sourceKind: baseSuggestion.sourceKind,
      suggestedName: llmResult.suggestedName || baseSuggestion.suggestedName,
      suggestedCommand: llmResult.suggestedCommand || baseSuggestion.suggestedCommand,
      suggestedArgs:
        llmResult.suggestedArgs.length > 0
          ? llmResult.suggestedArgs
          : baseSuggestion.suggestedArgs,
      requiredEnvVars:
        llmResult.requiredEnvVars.length > 0
          ? llmResult.requiredEnvVars.map((v) => ({
              name: v.name,
              required: v.required,
              description: v.description
            }))
          : baseSuggestion.requiredEnvVars,
      installSteps: baseSuggestion.installSteps,
      docsContextUsed: (docsExcerpt?.length ?? 0) > 0,
      summary: llmResult.summary,
      questions: baseSuggestion.questions
    };
  } catch (error) {
    // Any LLM failure → graceful fallback
    const message = error instanceof Error ? error.message : "Unknown error";
    return {
      ...baseSuggestion,
      provider: "heuristic-fallback",
      mode: "fallback",
      summary: `AI analysis failed (${message}). Using pattern matching instead.`
    };
  }
}
