export type AssistantSourceKind = "npm" | "github" | "manifest" | "generic";

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
  provider: "codex-internal" | "heuristic-fallback";
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

export interface AssistantProvider {
  suggestFromUrl: (input: string) => Promise<AssistantUrlSuggestion>;
}
