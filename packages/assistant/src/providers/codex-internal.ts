import { inferSuggestionFromUrl } from "../url-intake";
import type {
  AssistantAnalysisOptions,
  AssistantBackendProvider,
  AssistantEnvVarHint,
  AssistantProvider,
  AssistantUrlSuggestion
} from "../types";

interface FetchLike {
  (input: string, init?: { method?: string; headers?: Record<string, string>; body?: string; signal?: AbortSignal }): Promise<{
    ok: boolean;
    status: number;
    text: () => Promise<string>;
  }>;
}

interface CodexParsedResponse {
  sourceKind: "npm" | "github" | "manifest" | "generic";
  suggestedName: string;
  suggestedCommand: string;
  suggestedArgs: string[];
  requiredEnvVars: AssistantEnvVarHint[];
  installSteps: string[];
  docsContextUsed: boolean;
  summary: string;
  questions: Array<{ id: string; text: string }>;
}

interface FetchedDocsContext {
  used: boolean;
  excerpt: string;
}

interface ProviderRuntime {
  provider: AssistantBackendProvider;
  apiKey?: string;
  endpoint: string;
  model: string;
  strictMode: boolean;
}

interface CodexInternalProviderOptions {
  provider?: AssistantBackendProvider;
  apiKey?: string;
  endpoint?: string;
  model?: string;
  strictMode?: boolean;
  timeoutMs?: number;
  fetchImpl?: FetchLike;
}

function sanitizeQuestions(questions: unknown): Array<{ id: string; text: string }> {
  if (!Array.isArray(questions)) {
    return [];
  }

  return questions
    .map((question) => {
      if (typeof question !== "object" || question === null) {
        return null;
      }

      const q = question as Record<string, unknown>;
      if (typeof q.id !== "string" || typeof q.text !== "string") {
        return null;
      }

      return {
        id: q.id,
        text: q.text
      };
    })
    .filter((item): item is { id: string; text: string } => item !== null);
}

function sanitizeEnvHints(value: unknown): AssistantEnvVarHint[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item): AssistantEnvVarHint | null => {
      if (typeof item !== "object" || item === null) {
        return null;
      }

      const parsed = item as Record<string, unknown>;
      if (
        typeof parsed.name !== "string" ||
        typeof parsed.required !== "boolean" ||
        typeof parsed.description !== "string"
      ) {
        return null;
      }

      const hint: AssistantEnvVarHint = {
        name: parsed.name,
        required: parsed.required,
        description: parsed.description
      };

      if (typeof parsed.example === "string") {
        hint.example = parsed.example;
      }

      return hint;
    })
    .filter((item): item is AssistantEnvVarHint => item !== null);
}

function sanitizeInstallSteps(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((step): step is string => typeof step === "string" && step.length > 0);
}

function parseCodexJson(value: unknown): CodexParsedResponse | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  const parsed = value as Record<string, unknown>;
  const validKinds = new Set(["npm", "github", "manifest", "generic"]);

  if (
    typeof parsed.sourceKind !== "string" ||
    !validKinds.has(parsed.sourceKind) ||
    typeof parsed.suggestedName !== "string" ||
    typeof parsed.suggestedCommand !== "string" ||
    parsed.suggestedCommand.trim().length === 0 ||
    !Array.isArray(parsed.suggestedArgs) ||
    parsed.suggestedArgs.some((arg) => typeof arg !== "string") ||
    typeof parsed.summary !== "string"
  ) {
    return null;
  }

  return {
    sourceKind: parsed.sourceKind as CodexParsedResponse["sourceKind"],
    suggestedName: parsed.suggestedName,
    suggestedCommand: parsed.suggestedCommand.trim(),
    suggestedArgs: parsed.suggestedArgs as string[],
    requiredEnvVars: sanitizeEnvHints(parsed.requiredEnvVars),
    installSteps: sanitizeInstallSteps(parsed.installSteps),
    docsContextUsed: typeof parsed.docsContextUsed === "boolean" ? parsed.docsContextUsed : false,
    summary: parsed.summary,
    questions: sanitizeQuestions(parsed.questions)
  };
}

function stripHtml(raw: string): string {
  return raw
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractJsonText(rawText: string): string | null {
  const trimmed = rawText.trim();
  if (trimmed.length === 0) {
    return null;
  }

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced && fenced[1]) {
    return fenced[1].trim();
  }

  return trimmed;
}

function parseJsonText(rawText: string): unknown | null {
  const extracted = extractJsonText(rawText);
  if (!extracted) {
    return null;
  }

  try {
    return JSON.parse(extracted);
  } catch {
    const firstBrace = extracted.indexOf("{");
    const lastBrace = extracted.lastIndexOf("}");
    if (firstBrace === -1 || lastBrace <= firstBrace) {
      return null;
    }

    try {
      return JSON.parse(extracted.slice(firstBrace, lastBrace + 1));
    } catch {
      return null;
    }
  }
}

function extractOpenAiTextPayload(rawResponse: string): string | null {
  try {
    const parsed = JSON.parse(rawResponse) as Record<string, unknown>;

    if (typeof parsed.output_text === "string" && parsed.output_text.length > 0) {
      return parsed.output_text;
    }

    const output = parsed.output;
    if (!Array.isArray(output)) {
      return null;
    }

    for (const item of output) {
      if (typeof item !== "object" || item === null) {
        continue;
      }

      const content = (item as Record<string, unknown>).content;
      if (!Array.isArray(content)) {
        continue;
      }

      for (const part of content) {
        if (typeof part !== "object" || part === null) {
          continue;
        }

        const candidate = part as Record<string, unknown>;
        if (typeof candidate.text === "string" && candidate.text.length > 0) {
          return candidate.text;
        }
      }
    }

    return null;
  } catch {
    return null;
  }
}

function extractAnthropicTextPayload(rawResponse: string): string | null {
  try {
    const parsed = JSON.parse(rawResponse) as Record<string, unknown>;
    const content = parsed.content;

    if (!Array.isArray(content)) {
      return null;
    }

    const textParts = content
      .map((part) => {
        if (typeof part !== "object" || part === null) {
          return null;
        }
        const value = (part as Record<string, unknown>).text;
        return typeof value === "string" && value.length > 0 ? value : null;
      })
      .filter((value): value is string => value !== null);

    return textParts.length > 0 ? textParts.join("\n") : null;
  } catch {
    return null;
  }
}

function extractGeminiTextPayload(rawResponse: string): string | null {
  try {
    const parsed = JSON.parse(rawResponse) as Record<string, unknown>;
    const candidates = parsed.candidates;
    if (!Array.isArray(candidates) || candidates.length === 0) {
      return null;
    }

    const first = candidates[0];
    if (typeof first !== "object" || first === null) {
      return null;
    }

    const content = (first as Record<string, unknown>).content;
    if (typeof content !== "object" || content === null) {
      return null;
    }

    const parts = (content as Record<string, unknown>).parts;
    if (!Array.isArray(parts)) {
      return null;
    }

    const textParts = parts
      .map((part) => {
        if (typeof part !== "object" || part === null) {
          return null;
        }
        const text = (part as Record<string, unknown>).text;
        return typeof text === "string" && text.length > 0 ? text : null;
      })
      .filter((value): value is string => value !== null);

    return textParts.length > 0 ? textParts.join("\n") : null;
  } catch {
    return null;
  }
}

function defaultModel(provider: AssistantBackendProvider): string {
  switch (provider) {
    case "openai":
      return "gpt-4.1";
    case "anthropic":
      return "claude-3-5-sonnet-20241022";
    case "gemini":
      return "gemini-1.5-pro";
    case "bedrock":
      return "anthropic.claude-3-5-sonnet-20241022-v2:0";
    case "codex-internal":
    default:
      return "gpt-5-codex";
  }
}

function defaultEndpoint(provider: AssistantBackendProvider, model: string): string {
  switch (provider) {
    case "anthropic":
      return "https://api.anthropic.com/v1/messages";
    case "gemini":
      return `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
    case "openai":
    case "codex-internal":
      return "https://api.openai.com/v1/responses";
    case "bedrock":
      return "";
    default:
      return "";
  }
}

function isUrlInput(input: string): boolean {
  const trimmed = input.trim();
  return trimmed.startsWith("http://") || trimmed.startsWith("https://");
}

function createPrompt(input: string, docsContext: FetchedDocsContext, strictMode: boolean): string {
  return [
    "You are MCP Gateway Manager's MCP configuration analyst.",
    "Goal: produce an accurate MCP server configuration from the user's URL or question.",
    "Important quality rules:",
    "- Do not guess command names, args, or env vars.",
    "- If a value is not explicitly supported by context/docs, ask a question for it.",
    "- Prefer official installation docs and verified command syntax.",
    strictMode
      ? "- Strict mode is ON: if documentation/context is insufficient, return conservative output and explicit follow-up questions."
      : "- Strict mode is OFF: provide best effort output with uncertainty notes.",
    "Return ONLY valid JSON with fields:",
    "sourceKind (npm|github|manifest|generic), suggestedName, suggestedCommand, suggestedArgs (string[]),",
    "requiredEnvVars (array of {name,required,description,example?}),",
    "installSteps (string[]), docsContextUsed (boolean), summary (string), questions (array of {id,text}).",
    "The summary should state evidence quality and what was verified.",
    `Input: ${input}`,
    docsContext.used
      ? `Fetched documentation excerpt: ${docsContext.excerpt}`
      : "Fetched documentation excerpt: unavailable"
  ].join("\n");
}

function mergeFallbackWithDocs(
  fallback: AssistantUrlSuggestion,
  docsContext: FetchedDocsContext
): AssistantUrlSuggestion {
  if (!docsContext.used) {
    return fallback;
  }

  return {
    ...fallback,
    docsContextUsed: true,
    summary: `${fallback.summary} Documentation excerpt was fetched and attached for analysis.`
  };
}

function withFallbackReason(fallback: AssistantUrlSuggestion, reason: string): AssistantUrlSuggestion {
  return {
    ...fallback,
    summary: `${fallback.summary} ${reason}`
  };
}

export class CodexInternalProvider implements AssistantProvider {
  private readonly provider: AssistantBackendProvider;
  private readonly apiKey?: string;
  private readonly endpoint?: string;
  private readonly model?: string;
  private readonly strictMode: boolean;
  private readonly timeoutMs: number;
  private readonly fetchImpl: FetchLike;

  public constructor(options: CodexInternalProviderOptions = {}) {
    this.provider = options.provider ?? "codex-internal";
    this.apiKey = options.apiKey ?? process.env.CODEX_INTERNAL_API_KEY ?? process.env.OPENAI_API_KEY;
    this.endpoint = options.endpoint ?? process.env.CODEX_INTERNAL_ENDPOINT;
    this.model = options.model ?? process.env.CODEX_INTERNAL_MODEL;
    this.strictMode = options.strictMode ?? false;
    this.timeoutMs = options.timeoutMs ?? 12000;
    this.fetchImpl = options.fetchImpl ?? (globalThis.fetch as unknown as FetchLike);
  }

  private resolveRuntime(overrides?: AssistantAnalysisOptions): ProviderRuntime {
    const provider = overrides?.provider ?? this.provider;
    const model = overrides?.model ?? this.model ?? defaultModel(provider);
    const endpoint = overrides?.endpoint ?? this.endpoint ?? defaultEndpoint(provider, model);
    const strictMode = overrides?.strictMode ?? this.strictMode;
    const apiKey = overrides?.apiKey ?? this.apiKey;

    return {
      provider,
      model,
      endpoint,
      strictMode,
      apiKey
    };
  }

  private async fetchDocumentationContext(input: string): Promise<FetchedDocsContext> {
    if (typeof this.fetchImpl !== "function" || !isUrlInput(input)) {
      return { used: false, excerpt: "" };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.min(this.timeoutMs, 8000));

    try {
      const response = await this.fetchImpl(input.trim(), {
        method: "GET",
        headers: {
          "User-Agent": "MCP-Gateway-Manager/1.0"
        },
        signal: controller.signal
      });

      if (!response.ok) {
        return { used: false, excerpt: "" };
      }

      const raw = await response.text();
      const cleaned = stripHtml(raw);
      if (cleaned.length === 0) {
        return { used: false, excerpt: "" };
      }

      return {
        used: true,
        excerpt: cleaned.slice(0, 5000)
      };
    } catch {
      return { used: false, excerpt: "" };
    } finally {
      clearTimeout(timer);
    }
  }

  private async invokeOpenAiCompatible(
    runtime: ProviderRuntime,
    prompt: string,
    signal: AbortSignal
  ): Promise<string> {
    if (!runtime.apiKey) {
      throw new Error("API key is required for this provider.");
    }
    if (!runtime.endpoint || runtime.endpoint.trim().length === 0) {
      throw new Error("Endpoint is required for this provider.");
    }

    const response = await this.fetchImpl(runtime.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${runtime.apiKey}`
      },
      body: JSON.stringify({
        model: runtime.model,
        input: prompt
      }),
      signal
    });

    const raw = await response.text();
    if (!response.ok) {
      throw new Error(`Model request failed (${response.status}).`);
    }

    return extractOpenAiTextPayload(raw) ?? raw;
  }

  private async invokeAnthropic(
    runtime: ProviderRuntime,
    prompt: string,
    signal: AbortSignal
  ): Promise<string> {
    if (!runtime.apiKey) {
      throw new Error("Anthropic API key is required.");
    }
    if (!runtime.endpoint || runtime.endpoint.trim().length === 0) {
      throw new Error("Anthropic endpoint is required.");
    }

    const response = await this.fetchImpl(runtime.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": runtime.apiKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: runtime.model,
        max_tokens: 1400,
        temperature: 0.1,
        system: "Return only strict JSON. Do not include markdown wrappers.",
        messages: [
          {
            role: "user",
            content: prompt
          }
        ]
      }),
      signal
    });

    const raw = await response.text();
    if (!response.ok) {
      throw new Error(`Anthropic request failed (${response.status}).`);
    }

    return extractAnthropicTextPayload(raw) ?? raw;
  }

  private async invokeGemini(
    runtime: ProviderRuntime,
    prompt: string,
    signal: AbortSignal
  ): Promise<string> {
    if (!runtime.apiKey) {
      throw new Error("Gemini API key is required.");
    }
    if (!runtime.endpoint || runtime.endpoint.trim().length === 0) {
      throw new Error("Gemini endpoint is required.");
    }

    const endpointWithKey = runtime.endpoint.includes("?")
      ? `${runtime.endpoint}&key=${encodeURIComponent(runtime.apiKey)}`
      : `${runtime.endpoint}?key=${encodeURIComponent(runtime.apiKey)}`;

    const response = await this.fetchImpl(endpointWithKey, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.1
        }
      }),
      signal
    });

    const raw = await response.text();
    if (!response.ok) {
      throw new Error(`Gemini request failed (${response.status}).`);
    }

    return extractGeminiTextPayload(raw) ?? raw;
  }

  private async requestProviderText(
    runtime: ProviderRuntime,
    prompt: string,
    signal: AbortSignal
  ): Promise<string> {
    switch (runtime.provider) {
      case "anthropic":
        return this.invokeAnthropic(runtime, prompt, signal);
      case "gemini":
        return this.invokeGemini(runtime, prompt, signal);
      case "bedrock":
        if (!runtime.endpoint || runtime.endpoint.trim().length === 0) {
          throw new Error(
            "Bedrock mode requires a configured endpoint. Use an API gateway/proxy endpoint for bearer-key auth."
          );
        }
        return this.invokeOpenAiCompatible(runtime, prompt, signal);
      case "openai":
      case "codex-internal":
      default:
        return this.invokeOpenAiCompatible(runtime, prompt, signal);
    }
  }

  public async suggestFromUrl(
    input: string,
    options?: AssistantAnalysisOptions
  ): Promise<AssistantUrlSuggestion> {
    const fallback = inferSuggestionFromUrl(input);
    const docsContext = await this.fetchDocumentationContext(input);
    const docsAwareFallback = mergeFallbackWithDocs(fallback, docsContext);
    const runtime = this.resolveRuntime(options);

    if (runtime.strictMode && isUrlInput(input) && !docsContext.used) {
      throw new Error(
        "Strict analysis is enabled, but documentation could not be fetched from the provided URL."
      );
    }

    if (typeof this.fetchImpl !== "function") {
      if (runtime.strictMode) {
        throw new Error("Assistant runtime is missing a fetch implementation required for strict analysis.");
      }
      return withFallbackReason(
        docsAwareFallback,
        "Live model analysis is unavailable in this runtime."
      );
    }

    if (!runtime.apiKey) {
      if (runtime.strictMode) {
        throw new Error("Strict analysis requires an API key for the selected provider.");
      }
      return withFallbackReason(
        docsAwareFallback,
        `Provider '${runtime.provider}' has no API key configured, so heuristic fallback was used.`
      );
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const prompt = createPrompt(input, docsContext, runtime.strictMode);
      const text = await this.requestProviderText(runtime, prompt, controller.signal);
      const parsedJson = parseJsonText(text);
      const parsed = parseCodexJson(parsedJson);

      if (!parsed) {
        if (runtime.strictMode) {
          throw new Error("Model response did not contain valid configuration JSON.");
        }
        return withFallbackReason(
          docsAwareFallback,
          "Model response could not be parsed into valid MCP suggestion JSON."
        );
      }

      return {
        provider: runtime.provider,
        mode: "live",
        normalizedUrl: docsAwareFallback.normalizedUrl,
        sourceKind: parsed.sourceKind,
        suggestedName: parsed.suggestedName,
        suggestedCommand: parsed.suggestedCommand,
        suggestedArgs: parsed.suggestedArgs,
        requiredEnvVars:
          parsed.requiredEnvVars.length > 0 ? parsed.requiredEnvVars : docsAwareFallback.requiredEnvVars,
        installSteps: parsed.installSteps.length > 0 ? parsed.installSteps : docsAwareFallback.installSteps,
        docsContextUsed: parsed.docsContextUsed || docsContext.used,
        summary: parsed.summary,
        questions: parsed.questions.length > 0 ? parsed.questions : docsAwareFallback.questions
      };
    } catch (error) {
      if (runtime.strictMode) {
        throw error instanceof Error ? error : new Error("Strict analysis failed.");
      }

      return withFallbackReason(
        docsAwareFallback,
        error instanceof Error
          ? `Live model analysis failed (${error.message}).`
          : "Live model analysis failed."
      );
    } finally {
      clearTimeout(timer);
    }
  }
}
