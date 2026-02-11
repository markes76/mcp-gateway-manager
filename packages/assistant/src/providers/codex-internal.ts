import { inferSuggestionFromUrl } from "../url-intake";
import type { AssistantEnvVarHint, AssistantProvider, AssistantUrlSuggestion } from "../types";

interface FetchLike {
  (input: string, init?: { method?: string; headers?: Record<string, string>; body?: string; signal?: AbortSignal }): Promise<{
    ok: boolean;
    status: number;
    text: () => Promise<string>;
  }>;
}

interface CodexInternalProviderOptions {
  apiKey?: string;
  endpoint?: string;
  model?: string;
  timeoutMs?: number;
  fetchImpl?: FetchLike;
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
    !Array.isArray(parsed.suggestedArgs) ||
    parsed.suggestedArgs.some((arg) => typeof arg !== "string") ||
    typeof parsed.summary !== "string"
  ) {
    return null;
  }

  return {
    sourceKind: parsed.sourceKind as CodexParsedResponse["sourceKind"],
    suggestedName: parsed.suggestedName,
    suggestedCommand: parsed.suggestedCommand,
    suggestedArgs: parsed.suggestedArgs as string[],
    requiredEnvVars: sanitizeEnvHints(parsed.requiredEnvVars),
    installSteps: sanitizeInstallSteps(parsed.installSteps),
    docsContextUsed: typeof parsed.docsContextUsed === "boolean" ? parsed.docsContextUsed : false,
    summary: parsed.summary,
    questions: sanitizeQuestions(parsed.questions)
  };
}

function extractTextPayload(rawResponse: string): string | null {
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
        const text = candidate.text;
        if (typeof text === "string" && text.length > 0) {
          return text;
        }
      }
    }

    return null;
  } catch {
    return null;
  }
}

function stripHtml(raw: string): string {
  return raw
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function createPrompt(url: string, docsContext: FetchedDocsContext): string {
  return [
    "You are Codex Internal for MCP Gateway Manager.",
    "Task: derive a near-ready MCP configuration from URL/docs input with minimal user interaction.",
    "Return ONLY valid JSON with fields:",
    "sourceKind (npm|github|manifest|generic), suggestedName, suggestedCommand, suggestedArgs (string[]),",
    "requiredEnvVars (array of {name,required,description,example?}),",
    "installSteps (string[]), docsContextUsed (boolean), summary (string), questions (array of {id,text}).",
    "If API keys are required, include them in requiredEnvVars.",
    "Keep installSteps short and executable by non-developers.",
    "Questions should only cover unresolved choices.",
    `MCP input URL or package: ${url}`,
    docsContext.used ? `Fetched documentation excerpt: ${docsContext.excerpt}` : "Fetched documentation excerpt: unavailable"
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

export class CodexInternalProvider implements AssistantProvider {
  private readonly apiKey?: string;
  private readonly endpoint: string;
  private readonly model: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: FetchLike;

  public constructor(options: CodexInternalProviderOptions = {}) {
    this.apiKey = options.apiKey ?? process.env.CODEX_INTERNAL_API_KEY ?? process.env.OPENAI_API_KEY;
    this.endpoint = options.endpoint ?? process.env.CODEX_INTERNAL_ENDPOINT ?? "https://api.openai.com/v1/responses";
    this.model = options.model ?? process.env.CODEX_INTERNAL_MODEL ?? "gpt-5-codex";
    this.timeoutMs = options.timeoutMs ?? 12000;
    this.fetchImpl = options.fetchImpl ?? (globalThis.fetch as unknown as FetchLike);
  }

  private async fetchDocumentationContext(input: string): Promise<FetchedDocsContext> {
    if (typeof this.fetchImpl !== "function") {
      return { used: false, excerpt: "" };
    }

    const trimmed = input.trim();
    if (!(trimmed.startsWith("http://") || trimmed.startsWith("https://"))) {
      return { used: false, excerpt: "" };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.min(this.timeoutMs, 8000));

    try {
      const response = await this.fetchImpl(trimmed, {
        method: "GET",
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
        excerpt: cleaned.slice(0, 3000)
      };
    } catch {
      return { used: false, excerpt: "" };
    } finally {
      clearTimeout(timer);
    }
  }

  public async suggestFromUrl(input: string): Promise<AssistantUrlSuggestion> {
    const fallback = inferSuggestionFromUrl(input);
    const docsContext = await this.fetchDocumentationContext(input);
    const docsAwareFallback = mergeFallbackWithDocs(fallback, docsContext);

    if (!this.apiKey || typeof this.fetchImpl !== "function") {
      return docsAwareFallback;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await this.fetchImpl(this.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({
          model: this.model,
          input: createPrompt(input, docsContext)
        }),
        signal: controller.signal
      });

      const raw = await response.text();
      if (!response.ok) {
        return docsAwareFallback;
      }

      const textPayload = extractTextPayload(raw);
      if (!textPayload) {
        return docsAwareFallback;
      }

      let parsedJson: unknown;
      try {
        parsedJson = JSON.parse(textPayload);
      } catch {
        parsedJson = JSON.parse(raw);
      }

      const parsed = parseCodexJson(parsedJson);
      if (!parsed) {
        return docsAwareFallback;
      }

      return {
        provider: "codex-internal",
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
    } catch {
      return docsAwareFallback;
    } finally {
      clearTimeout(timer);
    }
  }
}
