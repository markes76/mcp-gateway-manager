export type AssistantSourceKind = "npm" | "github" | "manifest" | "generic";
export type AssistantBackendProvider =
  | "codex-internal"
  | "openai"
  | "anthropic"
  | "gemini"
  | "bedrock";

export interface AssistantQuestion {
  id: string;
  text: string;
}

export interface AssistantEnvVarHint {
  name: string;
  required: boolean;
  description: string;
  example?: string;
}

export interface AssistantUrlSuggestion {
  provider: AssistantBackendProvider | "heuristic-fallback";
  mode: "live" | "fallback";
  normalizedUrl: string;
  sourceKind: AssistantSourceKind;
  suggestedName: string;
  suggestedCommand: string;
  suggestedArgs: string[];
  requiredEnvVars: AssistantEnvVarHint[];
  installSteps: string[];
  docsContextUsed: boolean;
  questions: AssistantQuestion[];
  summary: string;
}

export interface AssistantAnalysisOptions {
  provider?: AssistantBackendProvider;
  apiKey?: string;
  model?: string;
  endpoint?: string;
  strictMode?: boolean;
}

export interface AssistantProvider {
  suggestFromUrl: (input: string, options?: AssistantAnalysisOptions) => Promise<AssistantUrlSuggestion>;
}
