import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { access, appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { app, BrowserWindow, dialog, ipcMain, type OpenDialogOptions } from "electron";

import { CodexInternalProvider } from "@mcp-gateway/assistant";
import {
  isThemeMode,
  type MCPServerDefinition,
  type PlatformMcpConfig,
  type ThemeMode
} from "@mcp-gateway/domain";
import {
  AdapterError,
  createClaudeAdapter,
  createCodexAdapter,
  createCursorAdapter,
  type PlatformName
} from "@mcp-gateway/platform-adapters";
import {
  applySyncPlan,
  planSync,
  type AdapterMap,
  type ManagedMcpPolicy,
  type PlatformConfigState,
  type SyncPlan
} from "@mcp-gateway/sync-engine";
import {
  type ActivityEntry,
  type ActivityLogResponse,
  type AssistantSuggestRequest,
  type AssistantSuggestionResponse,
  IPCChannels,
  type ApplySyncResponse,
  type GatewayStateResponse,
  type HealthCheckResponse,
  type PickConfigFileRequest,
  type PickConfigFileResponse,
  type PlatformSnapshot,
  type RestartPlatformResult,
  type RestartPlatformsRequest,
  type RestartPlatformsResponse,
  type SupportedPlatform,
  type SyncPlanPreviewResponse,
  type SyncRequestPayload,
  type ThemePreferenceResponse,
  type UpdateUserConfigRequest,
  type UserConfigResponse
} from "@mcp-gateway/ipc-contracts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const execFileAsync = promisify(execFile);

const PLATFORM_ORDER: SupportedPlatform[] = ["claude", "cursor", "codex"];

const adapters: AdapterMap = {
  claude: createClaudeAdapter(),
  cursor: createCursorAdapter(),
  codex: createCodexAdapter()
};

const assistantProvider = new CodexInternalProvider();

let themePreference: ThemeMode = "system";
let lastAppliedAt: string | null = null;
let mainWindow: BrowserWindow | null = null;

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 980,
    minHeight: 640,
    title: "MCP Gateway Manager",
    backgroundColor: "#f4f6f4",
    webPreferences: {
      preload: path.join(__dirname, "preload.mjs"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  if (devServerUrl) {
    void win.loadURL(devServerUrl);
  } else {
    void win.loadFile(path.join(__dirname, "../dist/index.html"));
  }

  win.on("closed", () => {
    if (mainWindow === win) {
      mainWindow = null;
    }
  });

  return win;
}

function getFallbackConfigPath(platform: SupportedPlatform): string {
  const candidates = adapters[platform].defaultConfigCandidates();
  const firstCandidate = candidates[0];
  if (typeof firstCandidate === "string" && firstCandidate.length > 0) {
    return firstCandidate;
  }

  return path.join(app.getPath("home"), ".config", platform, "mcp.json");
}

function getUserConfigPath(): string {
  return path.join(app.getPath("userData"), "user-config.json");
}

function getActivityLogPath(): string {
  return path.join(app.getPath("userData"), "activity-log.jsonl");
}

function cloneDefinition(definition: MCPServerDefinition): MCPServerDefinition {
  return {
    ...definition,
    args: definition.args ? [...definition.args] : undefined,
    env: definition.env ? { ...definition.env } : undefined
  };
}

function emptyConfig(): PlatformMcpConfig {
  return { mcpServers: {} };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function sanitizeServerDefinition(raw: unknown): MCPServerDefinition | null {
  if (!isRecord(raw)) {
    return null;
  }

  if (typeof raw.command !== "string" || raw.command.trim().length === 0) {
    return null;
  }

  const next: MCPServerDefinition = {
    command: raw.command.trim()
  };

  if (Array.isArray(raw.args) && raw.args.every((entry) => typeof entry === "string")) {
    next.args = [...raw.args];
  }

  if (isRecord(raw.env)) {
    const envEntries = Object.entries(raw.env).reduce<Record<string, string>>((accumulator, [key, value]) => {
      if (typeof value === "string") {
        accumulator[key] = value;
      }
      return accumulator;
    }, {});

    if (Object.keys(envEntries).length > 0) {
      next.env = envEntries;
    }
  }

  if (typeof raw.cwd === "string" && raw.cwd.length > 0) {
    next.cwd = raw.cwd;
  }

  if (typeof raw.enabled === "boolean") {
    next.enabled = raw.enabled;
  }

  return next;
}

async function readConfigWithRecovery(
  platform: SupportedPlatform,
  configPath: string
): Promise<{ config: PlatformMcpConfig; warning?: string }> {
  const adapter = adapters[toPlatformName(platform)];

  try {
    const readResult = await adapter.read(configPath);
    return { config: readResult.config };
  } catch (error) {
    if (
      !(error instanceof AdapterError) ||
      (error.code !== "INVALID_CONFIG" && error.code !== "MALFORMED_JSON")
    ) {
      throw error;
    }
  }

  let raw: string;
  try {
    raw = await readFile(configPath, "utf8");
  } catch (error) {
    return {
      config: emptyConfig(),
      warning:
        error instanceof Error
          ? `Config recovery failed: ${error.message}`
          : "Config recovery failed due to unknown read error."
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {
      config: emptyConfig(),
      warning: "Config recovery: file is malformed JSON. Preview and apply will ignore existing entries."
    };
  }

  if (!isRecord(parsed) || !isRecord(parsed.mcpServers)) {
    return {
      config: emptyConfig(),
      warning: "Config recovery: missing or invalid 'mcpServers' object. Existing entries were ignored."
    };
  }

  const mcpServers: PlatformMcpConfig["mcpServers"] = {};
  const droppedServers: string[] = [];

  for (const [serverName, rawDefinition] of Object.entries(parsed.mcpServers)) {
    const safeDefinition = sanitizeServerDefinition(rawDefinition);
    if (!safeDefinition) {
      droppedServers.push(serverName);
      continue;
    }

    mcpServers[serverName] = safeDefinition;
  }

  return {
    config: { mcpServers },
    warning:
      droppedServers.length > 0
        ? `Config recovery dropped invalid servers: ${droppedServers.join(", ")}.`
        : "Config recovery succeeded."
  };
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function defaultUserConfig(): UserConfigResponse {
  return {
    platforms: {
      claude: { configPathOverride: null, additionalConfigPaths: [] },
      cursor: { configPathOverride: null, additionalConfigPaths: [] },
      codex: { configPathOverride: null, additionalConfigPaths: [] }
    },
    savedAt: null
  };
}

function sanitizePathOverride(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function sanitizePathList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const paths = value
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

  return [...new Set(paths)];
}

function normalizeUserConfig(raw: unknown): UserConfigResponse {
  const defaults = defaultUserConfig();

  if (typeof raw !== "object" || raw === null) {
    return defaults;
  }

  const parsed = raw as Record<string, unknown>;
  const platformsRaw = parsed.platforms;

  const next: UserConfigResponse = {
    ...defaults,
    platforms: {
      claude: { ...defaults.platforms.claude },
      cursor: { ...defaults.platforms.cursor },
      codex: { ...defaults.platforms.codex }
    },
    savedAt: typeof parsed.savedAt === "string" ? parsed.savedAt : defaults.savedAt
  };

  if (typeof platformsRaw !== "object" || platformsRaw === null) {
    return next;
  }

  const platformRecord = platformsRaw as Record<string, unknown>;

  for (const platform of PLATFORM_ORDER) {
    const platformValue = platformRecord[platform];
    if (typeof platformValue !== "object" || platformValue === null) {
      continue;
    }

    const typedPlatform = platformValue as Record<string, unknown>;
    next.platforms[platform].configPathOverride = sanitizePathOverride(
      typeof typedPlatform.configPathOverride === "string"
        ? typedPlatform.configPathOverride
        : null
    );
    next.platforms[platform].additionalConfigPaths = sanitizePathList(
      typedPlatform.additionalConfigPaths
    );
  }

  return next;
}

function sanitizeUserConfigUpdate(payload: UpdateUserConfigRequest): UserConfigResponse {
  const defaults = defaultUserConfig();

  return {
    platforms: {
      claude: {
        configPathOverride: sanitizePathOverride(payload.platforms.claude.configPathOverride),
        additionalConfigPaths: sanitizePathList(payload.platforms.claude.additionalConfigPaths)
      },
      cursor: {
        configPathOverride: sanitizePathOverride(payload.platforms.cursor.configPathOverride),
        additionalConfigPaths: sanitizePathList(payload.platforms.cursor.additionalConfigPaths)
      },
      codex: {
        configPathOverride: sanitizePathOverride(payload.platforms.codex.configPathOverride),
        additionalConfigPaths: sanitizePathList(payload.platforms.codex.additionalConfigPaths)
      }
    },
    savedAt: defaults.savedAt
  };
}

async function readUserConfig(): Promise<UserConfigResponse> {
  const filePath = getUserConfigPath();

  if (!(await fileExists(filePath))) {
    return defaultUserConfig();
  }

  try {
    const raw = await readFile(filePath, "utf8");
    return normalizeUserConfig(JSON.parse(raw));
  } catch {
    return defaultUserConfig();
  }
}

async function writeUserConfig(payload: UpdateUserConfigRequest): Promise<UserConfigResponse> {
  const filePath = getUserConfigPath();
  const sanitized = sanitizeUserConfigUpdate(payload);
  const saved: UserConfigResponse = {
    ...sanitized,
    savedAt: new Date().toISOString()
  };

  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(saved, null, 2)}\n`, "utf8");

  return saved;
}

async function appendActivityEntry(entry: Omit<ActivityEntry, "id" | "timestamp">): Promise<void> {
  const filePath = getActivityLogPath();
  const nextEntry: ActivityEntry = {
    id: randomUUID(),
    timestamp: new Date().toISOString(),
    ...entry
  };

  await mkdir(path.dirname(filePath), { recursive: true });
  await appendFile(filePath, `${JSON.stringify(nextEntry)}\n`, "utf8");
}

function parseActivityEntry(rawLine: string): ActivityEntry | null {
  try {
    const parsed = JSON.parse(rawLine) as Record<string, unknown>;

    if (
      typeof parsed.id !== "string" ||
      typeof parsed.timestamp !== "string" ||
      typeof parsed.type !== "string" ||
      typeof parsed.title !== "string" ||
      typeof parsed.detail !== "string"
    ) {
      return null;
    }

    const validTypes = new Set([
      "sync-apply",
      "assistant-analysis",
      "settings-update",
      "platform-restart"
    ]);
    if (!validTypes.has(parsed.type)) {
      return null;
    }

    return {
      id: parsed.id,
      timestamp: parsed.timestamp,
      type: parsed.type as ActivityEntry["type"],
      title: parsed.title,
      detail: parsed.detail
    };
  } catch {
    return null;
  }
}

async function readActivityLog(limit: number = 200): Promise<ActivityLogResponse> {
  const filePath = getActivityLogPath();

  if (!(await fileExists(filePath))) {
    return { entries: [] };
  }

  try {
    const raw = await readFile(filePath, "utf8");
    const entries = raw
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((line) => parseActivityEntry(line))
      .filter((entry): entry is ActivityEntry => entry !== null)
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
      .slice(0, limit);

    return { entries };
  } catch {
    return { entries: [] };
  }
}

function getPlatformCandidatePaths(
  platform: SupportedPlatform,
  userConfig: UserConfigResponse,
  preferredPath?: string
): string[] {
  const configuredOverride = userConfig.platforms[platform].configPathOverride;
  const additionalPaths = userConfig.platforms[platform].additionalConfigPaths;

  if (configuredOverride) {
    return [...new Set([configuredOverride, ...additionalPaths])];
  }

  const defaults = adapters[platform].defaultConfigCandidates();
  const merged = preferredPath
    ? [preferredPath, ...defaults.filter((candidate) => candidate !== preferredPath)]
    : [...defaults];

  return [...new Set([...merged, ...additionalPaths])].filter((candidate) => candidate.trim().length > 0);
}

interface MergedPlatformConfigResult {
  found: boolean;
  configPath: string;
  config: PlatformMcpConfig;
  warnings: string[];
  sources: string[];
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown config error";
}

async function readMergedPlatformConfig(
  platform: SupportedPlatform,
  candidatePaths: string[]
): Promise<MergedPlatformConfigResult> {
  const uniqueCandidates = [...new Set(candidatePaths)].filter(
    (candidate) => candidate.trim().length > 0
  );
  const fallbackPath = getFallbackConfigPath(platform);
  const configPath = uniqueCandidates[0] ?? fallbackPath;

  if (uniqueCandidates.length === 0) {
    return {
      found: false,
      configPath,
      config: emptyConfig(),
      warnings: [],
      sources: []
    };
  }

  const mergedConfig = emptyConfig();
  const warnings: string[] = [];
  const sources: string[] = [];

  for (const candidatePath of uniqueCandidates) {
    if (!(await fileExists(candidatePath))) {
      continue;
    }

    sources.push(candidatePath);

    try {
      const recovered = await readConfigWithRecovery(platform, candidatePath);
      if (recovered.warning) {
        warnings.push(`${path.basename(candidatePath)}: ${recovered.warning}`);
      }

      for (const [serverName, definition] of Object.entries(recovered.config.mcpServers)) {
        if (mergedConfig.mcpServers[serverName] === undefined) {
          mergedConfig.mcpServers[serverName] = cloneDefinition(definition);
        }
      }
    } catch (error) {
      warnings.push(`${path.basename(candidatePath)}: ${formatError(error)}`);
    }
  }

  return {
    found: sources.length > 0,
    configPath: sources[0] ?? configPath,
    config: sources.length > 0 ? mergedConfig : emptyConfig(),
    warnings,
    sources
  };
}

function resolveConfigPathForPlatform(
  platform: SupportedPlatform,
  userConfig: UserConfigResponse,
  payloadPath?: string
): string {
  const payloadOverride = sanitizePathOverride(payloadPath ?? null);
  if (payloadOverride) {
    return payloadOverride;
  }

  const savedOverride = userConfig.platforms[platform].configPathOverride;
  if (savedOverride) {
    return savedOverride;
  }

  return getFallbackConfigPath(platform);
}

function normalizeConfigPaths(
  paths: SyncRequestPayload["platformConfigPaths"],
  userConfig: UserConfigResponse
): Record<SupportedPlatform, string> {
  return {
    claude: resolveConfigPathForPlatform("claude", userConfig, paths.claude),
    cursor: resolveConfigPathForPlatform("cursor", userConfig, paths.cursor),
    codex: resolveConfigPathForPlatform("codex", userConfig, paths.codex)
  };
}

function toPlatformName(platform: SupportedPlatform): PlatformName {
  return platform;
}

function buildManagedPolicies(policies: SyncRequestPayload["policies"]): ManagedMcpPolicy[] {
  const managed: ManagedMcpPolicy[] = [];

  for (const policy of policies) {
    const platformOverrides: ManagedMcpPolicy["platforms"] = {};
    let fallbackDefinition: MCPServerDefinition | undefined;

    for (const platform of PLATFORM_ORDER) {
      const definition = policy.platformDefinitions[platform];
      if (!definition) {
        continue;
      }

      const safeDefinition = cloneDefinition(definition);
      fallbackDefinition ??= safeDefinition;
      platformOverrides[platform] = {
        definition: safeDefinition,
        enabled: policy.platformEnabled[platform]
      };
    }

    if (!fallbackDefinition) {
      continue;
    }

    managed.push({
      name: policy.name,
      definition: fallbackDefinition,
      shared: false,
      globalEnabled: policy.globalEnabled,
      platforms: platformOverrides
    });
  }

  return managed;
}

async function readConfigState(paths: Record<SupportedPlatform, string>): Promise<PlatformConfigState> {
  const state: PlatformConfigState = {
    claude: emptyConfig(),
    cursor: emptyConfig(),
    codex: emptyConfig()
  };

  for (const platform of PLATFORM_ORDER) {
    const targetPath = paths[platform];
    if (!(await fileExists(targetPath))) {
      state[platform] = emptyConfig();
      continue;
    }

    try {
      const recovered = await readConfigWithRecovery(platform, targetPath);
      state[platform] = recovered.config;
      if (recovered.warning) {
        console.warn(`[mcp-gateway] ${platform} ${recovered.warning}`);
      }
    } catch (error) {
      console.warn(`[mcp-gateway] ${platform} ${formatError(error)}`);
      state[platform] = emptyConfig();
    }
  }

  return state;
}

async function ensureConfigFilesForChanges(plan: SyncPlan): Promise<void> {
  for (const platform of PLATFORM_ORDER) {
    const platformPlan = plan.byPlatform[platform];

    if (!platformPlan.hasChanges) {
      continue;
    }

    if (await fileExists(platformPlan.configPath)) {
      continue;
    }

    await adapters[toPlatformName(platform)].writeAtomic(platformPlan.configPath, emptyConfig());
  }
}

async function buildPlatformSnapshot(
  platform: SupportedPlatform,
  userConfig: UserConfigResponse
): Promise<PlatformSnapshot> {
  const configuredOverride = userConfig.platforms[platform].configPathOverride;
  const candidates = getPlatformCandidatePaths(platform, userConfig);
  const merged = await readMergedPlatformConfig(platform, candidates);

  if (!merged.found) {
    return {
      platform,
      found: false,
      configPath: configuredOverride ?? merged.configPath,
      servers: {},
      error: configuredOverride
        ? "Configured path does not exist yet. Apply sync to initialize this file."
        : undefined
    };
  }

  return {
    platform,
    found: true,
    configPath: configuredOverride ?? merged.configPath,
    servers: merged.config.mcpServers,
    error: merged.warnings.length > 0 ? merged.warnings.join(" | ") : undefined
  };
}

async function loadGatewayState(): Promise<GatewayStateResponse> {
  const userConfig = await readUserConfig();
  const platforms = await Promise.all(
    PLATFORM_ORDER.map((platform) => buildPlatformSnapshot(platform, userConfig))
  );

  return {
    platforms,
    lastAppliedAt
  };
}

function createSyncPlanSummary(plan: SyncPlan): SyncPlanPreviewResponse {
  return {
    generatedAt: plan.generatedAt,
    totalOperations: plan.totalOperations,
    byPlatform: {
      claude: {
        hasChanges: plan.byPlatform.claude.hasChanges,
        operationCount: plan.byPlatform.claude.operations.length
      },
      cursor: {
        hasChanges: plan.byPlatform.cursor.hasChanges,
        operationCount: plan.byPlatform.cursor.operations.length
      },
      codex: {
        hasChanges: plan.byPlatform.codex.hasChanges,
        operationCount: plan.byPlatform.codex.operations.length
      }
    }
  };
}

function createPlanFromPayload(
  payload: SyncRequestPayload,
  currentState: PlatformConfigState,
  normalizedPaths: Record<SupportedPlatform, string>
): SyncPlan {
  const policies = buildManagedPolicies(payload.policies);

  return planSync({
    currentState,
    configPaths: normalizedPaths,
    policies,
    preserveUnmanaged: true
  });
}

function resolveMacAppName(platform: SupportedPlatform): string {
  switch (platform) {
    case "claude":
      return "Claude";
    case "cursor":
      return "Cursor";
    case "codex":
      return "Codex";
    default:
      return platform;
  }
}

async function forceQuitMacApp(appName: string): Promise<void> {
  try {
    await execFileAsync("pkill", ["-9", "-x", appName]);
  } catch (error) {
    // Ignore "not running" errors from pkill.
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes("exit code 1")) {
      throw error;
    }
  }
}

async function gracefulQuitMacApp(appName: string): Promise<void> {
  await execFileAsync("osascript", ["-e", `tell application "${appName}" to quit`]);
}

async function openMacApp(appName: string): Promise<void> {
  await execFileAsync("open", ["-a", appName]);
}

async function restartPlatform(
  platform: SupportedPlatform,
  force: boolean
): Promise<RestartPlatformResult> {
  const appName = resolveMacAppName(platform);

  if (platform === "codex") {
    return {
      platform,
      appName,
      restarted: false,
      message:
        "Skipping auto restart for Codex to avoid interrupting active Codex sessions. Restart Codex manually."
    };
  }

  try {
    if (force) {
      await forceQuitMacApp(appName);
    } else {
      try {
        await gracefulQuitMacApp(appName);
      } catch {
        // App may not be running; continue with open.
      }
    }

    await openMacApp(appName);

    return {
      platform,
      appName,
      restarted: true,
      message: `${appName} was restarted.`
    };
  } catch (error) {
    const baseMessage = error instanceof Error ? error.message : "Unknown restart error";
    return {
      platform,
      appName,
      restarted: false,
      message: `Failed to restart ${appName}: ${baseMessage}`
    };
  }
}

async function restartPlatforms(
  payload: RestartPlatformsRequest
): Promise<RestartPlatformsResponse> {
  const uniquePlatforms = [...new Set(payload.platforms)].filter((platform) =>
    PLATFORM_ORDER.includes(platform)
  );
  const results: RestartPlatformResult[] = [];

  if (process.platform !== "darwin") {
    for (const platform of uniquePlatforms) {
      const appName = resolveMacAppName(platform);
      results.push({
        platform,
        appName,
        restarted: false,
        message: "Platform restart automation is currently implemented for macOS only."
      });
    }
    return {
      requestedAt: new Date().toISOString(),
      results
    };
  }

  for (const platform of uniquePlatforms) {
    results.push(await restartPlatform(platform, payload.force));
  }

  await appendActivityEntry({
    type: "platform-restart",
    title: "Platform restart requested",
    detail: results
      .map((result) => `${result.appName}: ${result.restarted ? "restarted" : "failed"}`)
      .join(" | ")
  });

  return {
    requestedAt: new Date().toISOString(),
    results
  };
}

function registerIpcHandlers(): void {
  ipcMain.handle(IPCChannels.healthCheck, (): HealthCheckResponse => {
    return {
      app: "mcp-gateway-manager",
      status: "ok",
      timestamp: new Date().toISOString()
    };
  });

  ipcMain.handle(IPCChannels.getThemePreference, (): ThemePreferenceResponse => {
    return { mode: themePreference };
  });

  ipcMain.handle(
    IPCChannels.setThemePreference,
    (_event, mode: string): ThemePreferenceResponse => {
      if (!isThemeMode(mode)) {
        throw new Error(`Invalid theme mode: ${mode}`);
      }

      themePreference = mode;
      return { mode };
    }
  );

  ipcMain.handle(IPCChannels.loadGatewayState, (): Promise<GatewayStateResponse> => {
    return loadGatewayState();
  });

  ipcMain.handle(
    IPCChannels.pickConfigFilePath,
    async (_event, payload: PickConfigFileRequest): Promise<PickConfigFileResponse> => {
      const focusedWindow = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
      const platformLabel = payload.platform ? payload.platform.toUpperCase() : "Platform";
      const dialogOptions: OpenDialogOptions = {
        title: `Select ${platformLabel} MCP JSON`,
        defaultPath: app.getPath("home"),
        properties: ["openFile"],
        filters: [
          { name: "JSON", extensions: ["json"] },
          { name: "All Files", extensions: ["*"] }
        ]
      };

      const selected = focusedWindow
        ? await dialog.showOpenDialog(focusedWindow, dialogOptions)
        : await dialog.showOpenDialog(dialogOptions);

      if (selected.canceled || selected.filePaths.length === 0) {
        return { path: null };
      }

      return { path: selected.filePaths[0] ?? null };
    }
  );

  ipcMain.handle(IPCChannels.getUserConfig, (): Promise<UserConfigResponse> => {
    return readUserConfig();
  });

  ipcMain.handle(
    IPCChannels.updateUserConfig,
    async (_event, payload: UpdateUserConfigRequest): Promise<UserConfigResponse> => {
      const saved = await writeUserConfig(payload);
      await appendActivityEntry({
        type: "settings-update",
        title: "Settings updated",
        detail: "Platform configuration path overrides were updated."
      });
      return saved;
    }
  );

  ipcMain.handle(IPCChannels.getActivityLog, (): Promise<ActivityLogResponse> => {
    return readActivityLog();
  });

  ipcMain.handle(
    IPCChannels.previewSync,
    async (_event, payload: SyncRequestPayload): Promise<SyncPlanPreviewResponse> => {
      const userConfig = await readUserConfig();
      const normalizedPaths = normalizeConfigPaths(payload.platformConfigPaths, userConfig);
      const currentState = await readConfigState(normalizedPaths);
      const plan = createPlanFromPayload(
        {
          ...payload,
          platformConfigPaths: normalizedPaths
        },
        currentState,
        normalizedPaths
      );

      return createSyncPlanSummary(plan);
    }
  );

  ipcMain.handle(
    IPCChannels.applySync,
    async (_event, payload: SyncRequestPayload): Promise<ApplySyncResponse> => {
      const userConfig = await readUserConfig();
      const normalizedPaths = normalizeConfigPaths(payload.platformConfigPaths, userConfig);
      const currentState = await readConfigState(normalizedPaths);
      const plan = createPlanFromPayload(
        {
          ...payload,
          platformConfigPaths: normalizedPaths
        },
        currentState,
        normalizedPaths
      );

      await ensureConfigFilesForChanges(plan);

      const result = await applySyncPlan(plan, adapters, {
        journalPath: path.join(app.getPath("userData"), "sync-journal.jsonl")
      });

      lastAppliedAt = result.appliedAt;

      await appendActivityEntry({
        type: "sync-apply",
        title: "Sync applied",
        detail: `Applied ${result.operations.length} platform update(s).`
      });

      return {
        appliedAt: result.appliedAt,
        operations: result.operations.map((operation) => ({
          platform: operation.platform,
          configPath: operation.configPath,
          backupPath: operation.backupPath,
          operationCount: operation.operationCount
        }))
      };
    }
  );

  ipcMain.handle(
    IPCChannels.restartPlatforms,
    async (_event, payload: RestartPlatformsRequest): Promise<RestartPlatformsResponse> => {
      if (!payload || !Array.isArray(payload.platforms)) {
        throw new Error("Restart request requires a 'platforms' array.");
      }

      return restartPlatforms(payload);
    }
  );

  ipcMain.handle(
    IPCChannels.assistantSuggestFromUrl,
    async (_event, payload: AssistantSuggestRequest): Promise<AssistantSuggestionResponse> => {
      if (!payload.input || payload.input.trim().length === 0) {
        throw new Error("Assistant input URL is required.");
      }

      const suggestion = await assistantProvider.suggestFromUrl(payload.input);

      await appendActivityEntry({
        type: "assistant-analysis",
        title: "Assistant analyzed MCP source",
        detail: `${suggestion.suggestedName} via ${suggestion.provider} (${suggestion.mode}).`
      });

      return suggestion;
    }
  );
}

app.whenReady().then(() => {
  registerIpcHandlers();
  mainWindow = createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
