import type { MCPServerDefinition, ThemeMode } from "@mcp-gateway/domain";

export const IPCChannels = {
  healthCheck: "gateway:health-check",
  getThemePreference: "gateway:get-theme-preference",
  setThemePreference: "gateway:set-theme-preference",
  loadGatewayState: "gateway:load-state",
  pickConfigFilePath: "gateway:pick-config-file-path",
  revealPath: "gateway:reveal-path",
  openPath: "gateway:open-path",
  getUserConfig: "gateway:get-user-config",
  updateUserConfig: "gateway:update-user-config",
  getActivityLog: "gateway:get-activity-log",
  createManualBackup: "gateway:create-manual-backup",
  getRevisionHistory: "gateway:get-revision-history",
  revertRevision: "gateway:revert-revision",
  previewSync: "gateway:preview-sync",
  applySync: "gateway:apply-sync",
  restartPlatforms: "gateway:restart-platforms",
  assistantSuggestFromUrl: "gateway:assistant-suggest-from-url",
  modelGetStatus: "assistant:model-status",
  modelDownload: "assistant:model-download",
  customPlatformAdd: "gateway:custom-platform-add",
  customPlatformRemove: "gateway:custom-platform-remove"
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
export const BUILT_IN_PLATFORMS: readonly SupportedPlatform[] = ["claude", "cursor", "codex"] as const;

export type AssistantBackendProvider =
  | "codex-internal"
  | "openai"
  | "anthropic"
  | "gemini"
  | "bedrock";

export type PlatformCategory = "builtin" | "known" | "custom";

export interface CustomPlatformEntry {
  id: string;
  name: string;
  configPath: string;
}

export interface CustomPlatformAddRequest {
  name: string;
  configPath: string;
}

export interface CustomPlatformRemoveRequest {
  id: string;
}

export interface PlatformSnapshot {
  platform: string;
  displayName: string;
  found: boolean;
  configPath: string;
  servers: Record<string, MCPServerDefinition>;
  error?: string;
  category: PlatformCategory;
}

export interface GatewayStateResponse {
  platforms: PlatformSnapshot[];
  lastAppliedAt: string | null;
}

export interface UserPlatformConfig {
  configPathOverride: string | null;
  additionalConfigPaths: string[];
}

export interface AssistantBackendConfig {
  provider: AssistantBackendProvider;
  apiKey: string | null;
  model: string | null;
  endpoint: string | null;
  strictMode: boolean;
}

export interface BackupPreferences {
  promptBeforeApply: boolean;
}

export interface UserConfigResponse {
  platforms: Record<SupportedPlatform, UserPlatformConfig>;
  assistant: AssistantBackendConfig;
  backup: BackupPreferences;
  savedAt: string | null;
}

export interface UpdateUserConfigRequest {
  platforms: Record<SupportedPlatform, UserPlatformConfig>;
  assistant: AssistantBackendConfig;
  backup: BackupPreferences;
}

export interface PickConfigFileRequest {
  platform?: string;
}

export interface PickConfigFileResponse {
  path: string | null;
}

export interface PathActionRequest {
  path: string;
}

export interface PathActionResponse {
  ok: boolean;
  message: string;
}

export interface ActivityEntry {
  id: string;
  timestamp: string;
  type:
    | "sync-apply"
    | "assistant-analysis"
    | "settings-update"
    | "platform-restart"
    | "manual-backup"
    | "revision-revert"
    | "custom-platform-add"
    | "custom-platform-remove";
  title: string;
  detail: string;
}

export interface ActivityLogResponse {
  entries: ActivityEntry[];
}

export interface MatrixPolicyInput {
  name: string;
  globalEnabled: boolean;
  platformEnabled: Record<string, boolean>;
  platformDefinitions: Partial<Record<string, MCPServerDefinition>>;
}

export interface SyncRequestPayload {
  policies: MatrixPolicyInput[];
  platformConfigPaths: Record<string, string>;
}

export interface PlatformPlanSummary {
  hasChanges: boolean;
  operationCount: number;
}

export interface SyncPlanPreviewResponse {
  generatedAt: string;
  totalOperations: number;
  byPlatform: Record<string, PlatformPlanSummary>;
}

export interface AppliedOperationSummary {
  platform: string;
  configPath: string;
  backupPath: string;
  operationCount: number;
}

export interface ApplySyncResponse {
  appliedAt: string;
  revisionId: string;
  operations: AppliedOperationSummary[];
}

export interface ManualBackupRequest {
  platformConfigPaths: Record<string, string>;
  reason?: string;
}

export interface ManualBackupEntry {
  platform: string;
  configPath: string;
  backupPath: string;
  createdAt: string;
}

export interface ManualBackupResponse {
  createdAt: string;
  entries: ManualBackupEntry[];
  message: string;
}

export interface RevisionEntry {
  revisionId: string;
  timestamp: string;
  platform: string;
  configPath: string;
  backupPath: string;
  operationCount: number;
}

export interface RevisionSummary {
  revisionId: string;
  appliedAt: string;
  totalOperations: number;
  platforms: string[];
  entries: RevisionEntry[];
}

export interface RevisionHistoryResponse {
  revisions: RevisionSummary[];
}

export interface RevertRevisionRequest {
  revisionId: string;
}

export interface RevertRevisionResult {
  platform: string;
  configPath: string;
  backupPath: string;
  reverted: boolean;
  message: string;
}

export interface RevertRevisionResponse {
  revisionId: string;
  revertedAt: string;
  results: RevertRevisionResult[];
}

export interface RestartPlatformsRequest {
  platforms: SupportedPlatform[];
  force: boolean;
}

export interface RestartPlatformResult {
  platform: string;
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

export interface ModelStatusResponse {
  downloaded: boolean;
  modelName: string;
  modelPath: string;
  sizeBytes: number | null;
  downloading: boolean;
  downloadProgress: number;
  downloadedBytes: number;
  totalBytes: number;
  downloadError: string | null;
}

export interface AssistantSuggestionResponse {
  provider: AssistantBackendProvider | "local-llm" | "heuristic-fallback";
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
  revealPath: (payload: PathActionRequest) => Promise<PathActionResponse>;
  openPath: (payload: PathActionRequest) => Promise<PathActionResponse>;
  getUserConfig: () => Promise<UserConfigResponse>;
  updateUserConfig: (payload: UpdateUserConfigRequest) => Promise<UserConfigResponse>;
  getActivityLog: () => Promise<ActivityLogResponse>;
  createManualBackup: (payload: ManualBackupRequest) => Promise<ManualBackupResponse>;
  getRevisionHistory: () => Promise<RevisionHistoryResponse>;
  revertRevision: (payload: RevertRevisionRequest) => Promise<RevertRevisionResponse>;
  previewSync: (payload: SyncRequestPayload) => Promise<SyncPlanPreviewResponse>;
  applySync: (payload: SyncRequestPayload) => Promise<ApplySyncResponse>;
  restartPlatforms: (payload: RestartPlatformsRequest) => Promise<RestartPlatformsResponse>;
  assistantSuggestFromUrl: (
    payload: AssistantSuggestRequest
  ) => Promise<AssistantSuggestionResponse>;
  getModelStatus: () => Promise<ModelStatusResponse>;
  downloadModel: () => Promise<ModelStatusResponse>;
  addCustomPlatform: (payload: CustomPlatformAddRequest) => Promise<CustomPlatformEntry>;
  removeCustomPlatform: (payload: CustomPlatformRemoveRequest) => Promise<void>;
}
