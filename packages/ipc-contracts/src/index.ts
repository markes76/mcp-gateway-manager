import type { MCPServerDefinition, ThemeMode } from "@mcp-gateway/domain";

export const IPCChannels = {
  healthCheck: "gateway:health-check",
  getThemePreference: "gateway:get-theme-preference",
  setThemePreference: "gateway:set-theme-preference",
  loadGatewayState: "gateway:load-state",
  pickConfigFilePath: "gateway:pick-config-file-path",
  getUserConfig: "gateway:get-user-config",
  updateUserConfig: "gateway:update-user-config",
  getActivityLog: "gateway:get-activity-log",
  previewSync: "gateway:preview-sync",
  applySync: "gateway:apply-sync",
  restartPlatforms: "gateway:restart-platforms",
  assistantSuggestFromUrl: "gateway:assistant-suggest-from-url"
} as const;

export interface HealthCheckResponse {
  app: "mcp-gateway-manager";
  status: "ok";
  timestamp: string;
}

export interface ThemePreferenceResponse {
  mode: ThemeMode;
}

export type SupportedPlatform = "claude" | "cursor" | "codex";

export interface PlatformSnapshot {
  platform: SupportedPlatform;
  found: boolean;
  configPath: string;
  servers: Record<string, MCPServerDefinition>;
  error?: string;
}

export interface GatewayStateResponse {
  platforms: PlatformSnapshot[];
  lastAppliedAt: string | null;
}

export interface UserPlatformConfig {
  configPathOverride: string | null;
  additionalConfigPaths: string[];
}

export interface UserConfigResponse {
  platforms: Record<SupportedPlatform, UserPlatformConfig>;
  savedAt: string | null;
}

export interface UpdateUserConfigRequest {
  platforms: Record<SupportedPlatform, UserPlatformConfig>;
}

export interface PickConfigFileRequest {
  platform?: SupportedPlatform;
}

export interface PickConfigFileResponse {
  path: string | null;
}

export interface ActivityEntry {
  id: string;
  timestamp: string;
  type: "sync-apply" | "assistant-analysis" | "settings-update" | "platform-restart";
  title: string;
  detail: string;
}

export interface ActivityLogResponse {
  entries: ActivityEntry[];
}

export interface MatrixPolicyInput {
  name: string;
  globalEnabled: boolean;
  platformEnabled: Record<SupportedPlatform, boolean>;
  platformDefinitions: Partial<Record<SupportedPlatform, MCPServerDefinition>>;
}

export interface SyncRequestPayload {
  policies: MatrixPolicyInput[];
  platformConfigPaths: Record<SupportedPlatform, string>;
}

export interface PlatformPlanSummary {
  hasChanges: boolean;
  operationCount: number;
}

export interface SyncPlanPreviewResponse {
  generatedAt: string;
  totalOperations: number;
  byPlatform: Record<SupportedPlatform, PlatformPlanSummary>;
}

export interface AppliedOperationSummary {
  platform: SupportedPlatform;
  configPath: string;
  backupPath: string;
  operationCount: number;
}

export interface ApplySyncResponse {
  appliedAt: string;
  operations: AppliedOperationSummary[];
}

export interface RestartPlatformsRequest {
  platforms: SupportedPlatform[];
  force: boolean;
}

export interface RestartPlatformResult {
  platform: SupportedPlatform;
  appName: string;
  restarted: boolean;
  message: string;
}

export interface RestartPlatformsResponse {
  requestedAt: string;
  results: RestartPlatformResult[];
}

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

export interface AssistantSuggestionResponse {
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
  summary: string;
  questions: AssistantQuestion[];
}

export interface AssistantSuggestRequest {
  input: string;
}

export interface GatewayApi {
  healthCheck: () => Promise<HealthCheckResponse>;
  getThemePreference: () => Promise<ThemePreferenceResponse>;
  setThemePreference: (mode: ThemeMode) => Promise<ThemePreferenceResponse>;
  loadGatewayState: () => Promise<GatewayStateResponse>;
  pickConfigFilePath: (payload: PickConfigFileRequest) => Promise<PickConfigFileResponse>;
  getUserConfig: () => Promise<UserConfigResponse>;
  updateUserConfig: (payload: UpdateUserConfigRequest) => Promise<UserConfigResponse>;
  getActivityLog: () => Promise<ActivityLogResponse>;
  previewSync: (payload: SyncRequestPayload) => Promise<SyncPlanPreviewResponse>;
  applySync: (payload: SyncRequestPayload) => Promise<ApplySyncResponse>;
  restartPlatforms: (payload: RestartPlatformsRequest) => Promise<RestartPlatformsResponse>;
  assistantSuggestFromUrl: (
    payload: AssistantSuggestRequest
  ) => Promise<AssistantSuggestionResponse>;
}
