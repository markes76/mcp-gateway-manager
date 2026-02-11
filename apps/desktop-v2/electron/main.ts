import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { access, appendFile, copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  shell,
  type OpenDialogOptions
} from "electron";

import { analyzeInput } from "./local-llm.js";
import {
  downloadModel as doDownloadModel,
  getModelStatus as doGetModelStatus
} from "./model-manager.js";
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
  BUILT_IN_PLATFORMS,
  type CustomPlatformAddRequest,
  type CustomPlatformEntry,
  type CustomPlatformRemoveRequest,
  IPCChannels,
  type ApplySyncResponse,
  type GatewayStateResponse,
  type HealthCheckResponse,
  type ManualBackupEntry,
  type ManualBackupRequest,
  type ManualBackupResponse,
  type ModelStatusResponse,
  type PathActionRequest,
  type PathActionResponse,
  type PickConfigFileRequest,
  type PickConfigFileResponse,
  type PlatformCategory,
  type PlatformPlanSummary,
  type RevertRevisionRequest,
  type RevertRevisionResponse,
  type PlatformSnapshot,
  type RevisionEntry,
  type RevisionHistoryResponse,
  type RevisionSummary,
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
const homedir = os.homedir();

const PLATFORM_ORDER: SupportedPlatform[] = ["claude", "cursor", "codex"];

const adapters: AdapterMap = {
  claude: createClaudeAdapter(),
  cursor: createCursorAdapter(),
  codex: createCodexAdapter()
};

// ---------- Known platforms (auto-discovered) ----------

interface KnownPlatformDef {
  id: string;
  name: string;
  configKey: string;
  candidates: Partial<Record<string, string[]>>;
}

const KNOWN_PLATFORMS: KnownPlatformDef[] = [
  {
    id: "windsurf",
    name: "Windsurf",
    configKey: "mcpServers",
    candidates: {
      darwin: [path.join(homedir, ".codeium", "windsurf", "mcp_config.json")],
      win32: [path.join(homedir, ".codeium", "windsurf", "mcp_config.json")],
      linux: [path.join(homedir, ".codeium", "windsurf", "mcp_config.json")]
    }
  },
  {
    id: "vscode",
    name: "VS Code",
    configKey: "servers",
    candidates: {
      darwin: [path.join(homedir, "Library", "Application Support", "Code", "User", "mcp.json")],
      win32: [path.join(process.env.APPDATA || homedir, "Code", "User", "mcp.json")],
      linux: [path.join(homedir, ".config", "Code", "User", "mcp.json")]
    }
  },
  {
    id: "zed",
    name: "Zed",
    configKey: "context_servers",
    candidates: {
      darwin: [path.join(homedir, ".config", "zed", "settings.json")],
      linux: [path.join(homedir, ".config", "zed", "settings.json")]
    }
  },
  {
    id: "continue",
    name: "Continue",
    configKey: "mcpServers",
    candidates: {
      darwin: [path.join(homedir, ".continue", "config.json")],
      win32: [path.join(homedir, ".continue", "config.json")],
      linux: [path.join(homedir, ".continue", "config.json")]
    }
  },
  {
    id: "cline",
    name: "Cline",
    configKey: "mcpServers",
    candidates: {
      darwin: [path.join(homedir, "Library", "Application Support", "Code", "User", "globalStorage", "saoudrizwan.claude-dev", "settings", "cline_mcp_settings.json")],
      win32: [path.join(process.env.APPDATA || homedir, "Code", "User", "globalStorage", "saoudrizwan.claude-dev", "settings", "cline_mcp_settings.json")],
      linux: [path.join(homedir, ".config", "Code", "User", "globalStorage", "saoudrizwan.claude-dev", "settings", "cline_mcp_settings.json")]
    }
  },
  {
    id: "roo-code",
    name: "Roo Code",
    configKey: "mcpServers",
    candidates: {
      darwin: [path.join(homedir, "Library", "Application Support", "Code", "User", "globalStorage", "rooveterinaryinc.roo-cline", "settings", "mcp_settings.json")],
      win32: [path.join(process.env.APPDATA || homedir, "Code", "User", "globalStorage", "rooveterinaryinc.roo-cline", "settings", "mcp_settings.json")],
      linux: [path.join(homedir, ".config", "Code", "User", "globalStorage", "rooveterinaryinc.roo-cline", "settings", "mcp_settings.json")]
    }
  },
  {
    id: "docker",
    name: "Docker Desktop",
    configKey: "mcpServers",
    candidates: {
      darwin: [path.join(homedir, ".docker", "mcp.json")],
      win32: [path.join(homedir, ".docker", "mcp.json")],
      linux: [path.join(homedir, ".docker", "mcp.json")]
    }
  }
];

// ---------- State ----------

let themePreference: ThemeMode = "system";
let lastAppliedAt: string | null = null;
let mainWindow: BrowserWindow | null = null;

// Map from known/custom platform ID to its configKey (for sync)
const platformConfigKeys = new Map<string, string>();

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 600,
    title: "MCP Gateway",
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 14, y: 12 },
    backgroundColor: "#f7f8fa",
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

function getSyncJournalPath(): string {
  return path.join(app.getPath("userData"), "sync-journal.jsonl");
}

function getCustomPlatformsPath(): string {
  return path.join(app.getPath("userData"), "custom-platforms.json");
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

// ---------- Generic platform config read/write ----------

function readServersFromGenericConfig(
  parsed: Record<string, unknown>,
  configKey: string
): Record<string, MCPServerDefinition> {
  const section = parsed[configKey];
  if (!isRecord(section)) return {};

  const servers: Record<string, MCPServerDefinition> = {};
  for (const [name, rawDef] of Object.entries(section)) {
    const def = sanitizeServerDefinition(rawDef);
    if (def) servers[name] = def;
  }
  return servers;
}

async function readGenericPlatformServers(
  configPath: string,
  configKey: string
): Promise<{ servers: Record<string, MCPServerDefinition>; error?: string }> {
  try {
    const raw = await readFile(configPath, "utf8");
    const parsed = JSON.parse(raw);
    if (!isRecord(parsed)) return { servers: {}, error: "Config is not a JSON object." };
    return { servers: readServersFromGenericConfig(parsed, configKey) };
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown read error";
    return { servers: {}, error: msg };
  }
}

async function writeGenericPlatformServers(
  configPath: string,
  configKey: string,
  servers: Record<string, MCPServerDefinition>
): Promise<string> {
  // Read existing file to preserve other keys
  let existing: Record<string, unknown> = {};
  try {
    const raw = await readFile(configPath, "utf8");
    const parsed = JSON.parse(raw);
    if (isRecord(parsed)) existing = parsed;
  } catch {
    // File doesn't exist or is invalid — start fresh
  }

  // Create backup before writing
  const backupPath = `${configPath}.${timestampStamp()}.${randomUUID().slice(0, 8)}.bak`;
  try {
    await copyFile(configPath, backupPath);
  } catch {
    // No existing file to backup
  }

  // Merge servers into the appropriate key
  existing[configKey] = servers;

  await mkdir(path.dirname(configPath), { recursive: true });
  await writeFile(configPath, `${JSON.stringify(existing, null, 2)}\n`, "utf8");

  return backupPath;
}

// ---------- Custom platforms storage ----------

async function readCustomPlatforms(): Promise<CustomPlatformEntry[]> {
  const filePath = getCustomPlatformsPath();
  if (!(await fileExists(filePath))) return [];

  try {
    const raw = await readFile(filePath, "utf8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (entry): entry is CustomPlatformEntry =>
        isRecord(entry) &&
        typeof entry.id === "string" &&
        typeof entry.name === "string" &&
        typeof entry.configPath === "string"
    );
  } catch {
    return [];
  }
}

async function writeCustomPlatforms(entries: CustomPlatformEntry[]): Promise<void> {
  const filePath = getCustomPlatformsPath();
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(entries, null, 2)}\n`, "utf8");
}

function sanitizePlatformId(name: string): string {
  const id = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return id.length > 0 ? `custom-${id}` : `custom-${randomUUID().slice(0, 8)}`;
}

async function addCustomPlatform(payload: CustomPlatformAddRequest): Promise<CustomPlatformEntry> {
  const entries = await readCustomPlatforms();
  const id = sanitizePlatformId(payload.name);

  // Prevent duplicate IDs
  const existingIndex = entries.findIndex((e) => e.id === id);
  const entry: CustomPlatformEntry = {
    id,
    name: payload.name.trim(),
    configPath: payload.configPath.trim()
  };

  if (existingIndex >= 0) {
    entries[existingIndex] = entry;
  } else {
    entries.push(entry);
  }

  await writeCustomPlatforms(entries);

  await appendActivityEntry({
    type: "custom-platform-add",
    title: "Custom platform added",
    detail: `${entry.name} at ${entry.configPath}`
  });

  return entry;
}

async function removeCustomPlatform(payload: CustomPlatformRemoveRequest): Promise<void> {
  const entries = await readCustomPlatforms();
  const filtered = entries.filter((e) => e.id !== payload.id);
  await writeCustomPlatforms(filtered);

  const removed = entries.find((e) => e.id === payload.id);
  await appendActivityEntry({
    type: "custom-platform-remove",
    title: "Custom platform removed",
    detail: removed ? `${removed.name}` : payload.id
  });
}

// ---------- Known platform discovery ----------

async function discoverKnownPlatform(def: KnownPlatformDef): Promise<PlatformSnapshot> {
  const osCandidates = def.candidates[process.platform] ?? [];

  for (const candidatePath of osCandidates) {
    if (await fileExists(candidatePath)) {
      platformConfigKeys.set(def.id, def.configKey);
      const result = await readGenericPlatformServers(candidatePath, def.configKey);
      return {
        platform: def.id,
        displayName: def.name,
        found: true,
        configPath: candidatePath,
        servers: result.servers,
        error: result.error,
        category: "known"
      };
    }
  }

  const fallbackPath = osCandidates[0] ?? "";
  platformConfigKeys.set(def.id, def.configKey);
  return {
    platform: def.id,
    displayName: def.name,
    found: false,
    configPath: fallbackPath,
    servers: {},
    category: "known"
  };
}

async function buildCustomPlatformSnapshot(entry: CustomPlatformEntry): Promise<PlatformSnapshot> {
  const found = await fileExists(entry.configPath);
  platformConfigKeys.set(entry.id, "mcpServers");

  if (!found) {
    return {
      platform: entry.id,
      displayName: entry.name,
      found: false,
      configPath: entry.configPath,
      servers: {},
      category: "custom"
    };
  }

  const result = await readGenericPlatformServers(entry.configPath, "mcpServers");
  return {
    platform: entry.id,
    displayName: entry.name,
    found: true,
    configPath: entry.configPath,
    servers: result.servers,
    error: result.error,
    category: "custom"
  };
}

// ---------- Shared helpers ----------

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function requireActionPath(payload: unknown): string {
  if (typeof payload !== "object" || payload === null) {
    throw new Error("Path action requires a payload object.");
  }

  const candidate = (payload as PathActionRequest).path;
  if (typeof candidate !== "string") {
    throw new Error("Path action requires a string 'path'.");
  }

  const trimmed = candidate.trim();
  if (trimmed.length === 0) {
    throw new Error("Path action requires a non-empty 'path'.");
  }

  return trimmed;
}

async function revealPath(payload: PathActionRequest): Promise<PathActionResponse> {
  const targetPath = requireActionPath(payload);
  if (!(await fileExists(targetPath))) {
    return {
      ok: false,
      message: `Path not found: ${targetPath}`
    };
  }

  shell.showItemInFolder(targetPath);
  return {
    ok: true,
    message: `Revealed in Finder: ${targetPath}`
  };
}

async function openPath(payload: PathActionRequest): Promise<PathActionResponse> {
  const targetPath = requireActionPath(payload);
  if (!(await fileExists(targetPath))) {
    return {
      ok: false,
      message: `Path not found: ${targetPath}`
    };
  }

  const errorText = await shell.openPath(targetPath);
  if (errorText.length > 0) {
    return {
      ok: false,
      message: `Unable to open path: ${errorText}`
    };
  }

  return {
    ok: true,
    message: `Opened path: ${targetPath}`
  };
}

function defaultUserConfig(): UserConfigResponse {
  return {
    platforms: {
      claude: { configPathOverride: null, additionalConfigPaths: [] },
      cursor: { configPathOverride: null, additionalConfigPaths: [] },
      codex: { configPathOverride: null, additionalConfigPaths: [] }
    },
    assistant: {
      provider: "codex-internal",
      apiKey: null,
      model: null,
      endpoint: null,
      strictMode: true
    },
    backup: {
      promptBeforeApply: true
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

function sanitizeOptionalText(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function sanitizeAssistantBackendConfig(value: unknown): UserConfigResponse["assistant"] {
  const defaults = defaultUserConfig().assistant;
  const validProviders = new Set(["codex-internal", "openai", "anthropic", "gemini", "bedrock"]);

  if (typeof value !== "object" || value === null) {
    return { ...defaults };
  }

  const parsed = value as Record<string, unknown>;
  const provider =
    typeof parsed.provider === "string" && validProviders.has(parsed.provider)
      ? (parsed.provider as UserConfigResponse["assistant"]["provider"])
      : defaults.provider;

  return {
    provider,
    apiKey: sanitizeOptionalText(parsed.apiKey),
    model: sanitizeOptionalText(parsed.model),
    endpoint: sanitizeOptionalText(parsed.endpoint),
    strictMode: typeof parsed.strictMode === "boolean" ? parsed.strictMode : defaults.strictMode
  };
}

function sanitizeBackupPreferences(value: unknown): UserConfigResponse["backup"] {
  const defaults = defaultUserConfig().backup;

  if (typeof value !== "object" || value === null) {
    return { ...defaults };
  }

  const parsed = value as Record<string, unknown>;
  return {
    promptBeforeApply:
      typeof parsed.promptBeforeApply === "boolean"
        ? parsed.promptBeforeApply
        : defaults.promptBeforeApply
  };
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
    assistant: { ...defaults.assistant },
    backup: { ...defaults.backup },
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

  next.assistant = sanitizeAssistantBackendConfig(parsed.assistant);
  next.backup = sanitizeBackupPreferences(parsed.backup);

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
    assistant: sanitizeAssistantBackendConfig(payload.assistant),
    backup: sanitizeBackupPreferences(payload.backup),
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
      "platform-restart",
      "manual-backup",
      "revision-revert",
      "custom-platform-add",
      "custom-platform-remove"
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

function isBuiltInPlatform(id: string): id is SupportedPlatform {
  return (BUILT_IN_PLATFORMS as readonly string[]).includes(id);
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
        enabled: policy.platformEnabled[platform] ?? false
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

function builtInDisplayName(platform: SupportedPlatform): string {
  switch (platform) {
    case "claude": return "Claude";
    case "cursor": return "Cursor";
    case "codex": return "Codex";
    default: return platform;
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
      displayName: builtInDisplayName(platform),
      found: false,
      configPath: configuredOverride ?? merged.configPath,
      servers: {},
      error: configuredOverride
        ? "Configured path does not exist yet. Apply sync to initialize this file."
        : undefined,
      category: "builtin"
    };
  }

  return {
    platform,
    displayName: builtInDisplayName(platform),
    found: true,
    configPath: configuredOverride ?? merged.configPath,
    servers: merged.config.mcpServers,
    error: merged.warnings.length > 0 ? merged.warnings.join(" | ") : undefined,
    category: "builtin"
  };
}

async function loadGatewayState(): Promise<GatewayStateResponse> {
  const userConfig = await readUserConfig();

  // Built-in platforms
  const builtInSnapshots = await Promise.all(
    PLATFORM_ORDER.map((platform) => buildPlatformSnapshot(platform, userConfig))
  );

  // Known platforms (auto-discovered)
  const knownSnapshots = await Promise.all(
    KNOWN_PLATFORMS.map((def) => discoverKnownPlatform(def))
  );

  // Custom platforms
  const customEntries = await readCustomPlatforms();
  const customSnapshots = await Promise.all(
    customEntries.map((entry) => buildCustomPlatformSnapshot(entry))
  );

  return {
    platforms: [...builtInSnapshots, ...knownSnapshots, ...customSnapshots],
    lastAppliedAt
  };
}

// ---------- Sync for additional (known + custom) platforms ----------

interface AdditionalPlatformSyncResult {
  platform: string;
  configPath: string;
  backupPath: string;
  operationCount: number;
}

async function syncAdditionalPlatform(
  platformId: string,
  configPath: string,
  policies: SyncRequestPayload["policies"]
): Promise<AdditionalPlatformSyncResult | null> {
  const configKey = platformConfigKeys.get(platformId) ?? "mcpServers";

  // Read current servers
  let existingServers: Record<string, MCPServerDefinition> = {};
  try {
    const result = await readGenericPlatformServers(configPath, configKey);
    existingServers = result.servers;
  } catch {
    // Start with empty
  }

  // Build desired server state from policies
  const desiredServers: Record<string, MCPServerDefinition> = {};
  for (const policy of policies) {
    const def = policy.platformDefinitions[platformId];
    const enabled = policy.platformEnabled[platformId] ?? false;
    if (def && enabled) {
      desiredServers[policy.name] = cloneDefinition(def);
    }
  }

  // Compute changes
  let changeCount = 0;
  const mergedServers = { ...existingServers };

  // Add/update managed servers
  for (const [name, def] of Object.entries(desiredServers)) {
    const existing = mergedServers[name];
    if (!existing || JSON.stringify(existing) !== JSON.stringify(def)) {
      changeCount++;
    }
    mergedServers[name] = def;
  }

  // Remove servers that are in policies but disabled
  for (const policy of policies) {
    const enabled = policy.platformEnabled[platformId] ?? false;
    if (!enabled && mergedServers[policy.name] !== undefined) {
      // Only remove if this server was previously managed by a policy
      if (policy.platformDefinitions[platformId]) {
        delete mergedServers[policy.name];
        changeCount++;
      }
    }
  }

  if (changeCount === 0) return null;

  const backupPath = await writeGenericPlatformServers(configPath, configKey, mergedServers);

  return {
    platform: platformId,
    configPath,
    backupPath,
    operationCount: changeCount
  };
}

function previewAdditionalPlatform(
  platformId: string,
  configPath: string,
  currentServers: Record<string, MCPServerDefinition>,
  policies: SyncRequestPayload["policies"]
): PlatformPlanSummary {
  let changeCount = 0;

  for (const policy of policies) {
    const def = policy.platformDefinitions[platformId];
    const enabled = policy.platformEnabled[platformId] ?? false;
    const existing = currentServers[policy.name];

    if (def && enabled) {
      if (!existing || JSON.stringify(existing) !== JSON.stringify(def)) {
        changeCount++;
      }
    } else if (policy.platformDefinitions[platformId] && existing) {
      changeCount++;
    }
  }

  return { hasChanges: changeCount > 0, operationCount: changeCount };
}

// ---------- Built-in sync plan helpers ----------

function createSyncPlanSummary(
  plan: SyncPlan,
  additionalPreviews: Record<string, PlatformPlanSummary>
): SyncPlanPreviewResponse {
  const byPlatform: Record<string, PlatformPlanSummary> = {};
  let totalOps = plan.totalOperations;

  for (const p of PLATFORM_ORDER) {
    byPlatform[p] = {
      hasChanges: plan.byPlatform[p].hasChanges,
      operationCount: plan.byPlatform[p].operations.length
    };
  }

  for (const [platformId, summary] of Object.entries(additionalPreviews)) {
    byPlatform[platformId] = summary;
    totalOps += summary.operationCount;
  }

  return {
    generatedAt: plan.generatedAt,
    totalOperations: totalOps,
    byPlatform
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

function parseSyncJournalEntry(rawLine: string): RevisionEntry | null {
  try {
    const parsed = JSON.parse(rawLine) as Record<string, unknown>;
    if (
      typeof parsed.timestamp !== "string" ||
      typeof parsed.platform !== "string" ||
      typeof parsed.configPath !== "string" ||
      typeof parsed.backupPath !== "string" ||
      typeof parsed.operationCount !== "number"
    ) {
      return null;
    }

    const revisionId =
      typeof parsed.revisionId === "string" && parsed.revisionId.trim().length > 0
        ? parsed.revisionId
        : `legacy-${parsed.timestamp}-${parsed.platform}`;

    return {
      revisionId,
      timestamp: parsed.timestamp,
      platform: parsed.platform,
      configPath: parsed.configPath,
      backupPath: parsed.backupPath,
      operationCount: parsed.operationCount
    };
  } catch {
    return null;
  }
}

async function readRevisionEntries(): Promise<RevisionEntry[]> {
  const journalPath = getSyncJournalPath();
  if (!(await fileExists(journalPath))) {
    return [];
  }

  try {
    const raw = await readFile(journalPath, "utf8");
    return raw
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((line) => parseSyncJournalEntry(line))
      .filter((entry): entry is RevisionEntry => entry !== null)
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  } catch {
    return [];
  }
}

async function readRevisionHistory(limit: number = 50): Promise<RevisionHistoryResponse> {
  const entries = await readRevisionEntries();
  const grouped = new Map<string, RevisionSummary>();

  for (const entry of entries) {
    const existing = grouped.get(entry.revisionId);
    if (!existing) {
      grouped.set(entry.revisionId, {
        revisionId: entry.revisionId,
        appliedAt: entry.timestamp,
        totalOperations: entry.operationCount,
        platforms: [entry.platform],
        entries: [entry]
      });
      continue;
    }

    existing.entries.push(entry);
    existing.totalOperations += entry.operationCount;
    if (!existing.platforms.includes(entry.platform)) {
      existing.platforms.push(entry.platform);
    }
    if (entry.timestamp > existing.appliedAt) {
      existing.appliedAt = entry.timestamp;
    }
  }

  const revisions = [...grouped.values()]
    .sort((a, b) => b.appliedAt.localeCompare(a.appliedAt))
    .slice(0, limit);

  return { revisions };
}

function timestampStamp(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

async function createManualBackup(payload: ManualBackupRequest): Promise<ManualBackupResponse> {
  const createdAt = new Date().toISOString();
  const entries: ManualBackupEntry[] = [];

  for (const [platform, rawPath] of Object.entries(payload.platformConfigPaths)) {
    if (typeof rawPath !== "string") continue;

    const configPath = rawPath.trim();
    if (configPath.length === 0 || !(await fileExists(configPath))) {
      continue;
    }

    const backupPath = `${configPath}.manual.${timestampStamp()}.${randomUUID().slice(0, 8)}.bak`;
    await copyFile(configPath, backupPath);

    entries.push({
      platform,
      configPath,
      backupPath,
      createdAt
    });
  }

  const reasonText = payload.reason ? ` (${payload.reason})` : "";
  await appendActivityEntry({
    type: "manual-backup",
    title: "Manual backup snapshot created",
    detail:
      entries.length > 0
        ? `Created ${entries.length} backup file(s)${reasonText}.`
        : `No backup files were created${reasonText}; target paths were unavailable.`
  });

  return {
    createdAt,
    entries,
    message:
      entries.length > 0
        ? `Created ${entries.length} manual backup file(s).`
        : "No backups created because selected config files were not found."
  };
}

async function revertRevision(payload: RevertRevisionRequest): Promise<RevertRevisionResponse> {
  if (!payload || typeof payload.revisionId !== "string" || payload.revisionId.trim().length === 0) {
    throw new Error("Revert request requires a non-empty revisionId.");
  }

  const targetRevisionId = payload.revisionId.trim();
  const entries = await readRevisionEntries();
  const matched = entries.filter((entry) => entry.revisionId === targetRevisionId);

  if (matched.length === 0) {
    throw new Error(`No revision found for '${targetRevisionId}'.`);
  }

  const results: RevertRevisionResponse["results"] = [];

  for (const entry of [...matched].reverse()) {
    try {
      if (!(await fileExists(entry.backupPath))) {
        results.push({
          platform: entry.platform,
          configPath: entry.configPath,
          backupPath: entry.backupPath,
          reverted: false,
          message: "Backup file not found."
        });
        continue;
      }

      await copyFile(entry.backupPath, entry.configPath);
      results.push({
        platform: entry.platform,
        configPath: entry.configPath,
        backupPath: entry.backupPath,
        reverted: true,
        message: "Reverted from backup."
      });
    } catch (error) {
      results.push({
        platform: entry.platform,
        configPath: entry.configPath,
        backupPath: entry.backupPath,
        reverted: false,
        message: error instanceof Error ? error.message : "Unknown revert failure"
      });
    }
  }

  await appendActivityEntry({
    type: "revision-revert",
    title: "Revision revert executed",
    detail: `${results.filter((result) => result.reverted).length}/${results.length} config file(s) reverted for ${targetRevisionId}.`
  });

  return {
    revisionId: targetRevisionId,
    revertedAt: new Date().toISOString(),
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

  ipcMain.handle(
    IPCChannels.revealPath,
    async (_event, payload: PathActionRequest): Promise<PathActionResponse> => {
      return revealPath(payload);
    }
  );

  ipcMain.handle(
    IPCChannels.openPath,
    async (_event, payload: PathActionRequest): Promise<PathActionResponse> => {
      return openPath(payload);
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
        detail: "Platform paths, assistant backend, and backup preferences were updated."
      });
      return saved;
    }
  );

  ipcMain.handle(IPCChannels.getActivityLog, (): Promise<ActivityLogResponse> => {
    return readActivityLog();
  });

  ipcMain.handle(
    IPCChannels.createManualBackup,
    async (_event, payload: ManualBackupRequest): Promise<ManualBackupResponse> => {
      if (!payload || typeof payload !== "object" || !payload.platformConfigPaths) {
        throw new Error("Manual backup requires platformConfigPaths.");
      }

      return createManualBackup(payload);
    }
  );

  ipcMain.handle(IPCChannels.getRevisionHistory, (): Promise<RevisionHistoryResponse> => {
    return readRevisionHistory();
  });

  ipcMain.handle(
    IPCChannels.revertRevision,
    async (_event, payload: RevertRevisionRequest): Promise<RevertRevisionResponse> => {
      return revertRevision(payload);
    }
  );

  ipcMain.handle(
    IPCChannels.previewSync,
    async (_event, payload: SyncRequestPayload): Promise<SyncPlanPreviewResponse> => {
      const userConfig = await readUserConfig();
      const normalizedPaths = normalizeConfigPaths(payload.platformConfigPaths, userConfig);
      const currentState = await readConfigState(normalizedPaths);
      const plan = createPlanFromPayload(
        { ...payload, platformConfigPaths: normalizedPaths },
        currentState,
        normalizedPaths
      );

      // Preview additional platforms
      const additionalPreviews: Record<string, PlatformPlanSummary> = {};
      const state = await loadGatewayState();
      for (const snap of state.platforms) {
        if (isBuiltInPlatform(snap.platform)) continue;
        const configPath = payload.platformConfigPaths[snap.platform] ?? snap.configPath;
        if (!configPath) continue;
        additionalPreviews[snap.platform] = previewAdditionalPlatform(
          snap.platform,
          configPath,
          snap.servers,
          payload.policies
        );
      }

      return createSyncPlanSummary(plan, additionalPreviews);
    }
  );

  ipcMain.handle(
    IPCChannels.applySync,
    async (_event, payload: SyncRequestPayload): Promise<ApplySyncResponse> => {
      const userConfig = await readUserConfig();
      const normalizedPaths = normalizeConfigPaths(payload.platformConfigPaths, userConfig);
      const currentState = await readConfigState(normalizedPaths);
      const plan = createPlanFromPayload(
        { ...payload, platformConfigPaths: normalizedPaths },
        currentState,
        normalizedPaths
      );

      await ensureConfigFilesForChanges(plan);

      const result = await applySyncPlan(plan, adapters, {
        journalPath: getSyncJournalPath()
      });

      // Apply to additional platforms
      const additionalOps: ApplySyncResponse["operations"] = [];
      const state = await loadGatewayState();
      for (const snap of state.platforms) {
        if (isBuiltInPlatform(snap.platform)) continue;
        const configPath = payload.platformConfigPaths[snap.platform] ?? snap.configPath;
        if (!configPath) continue;

        const syncResult = await syncAdditionalPlatform(snap.platform, configPath, payload.policies);
        if (syncResult) {
          additionalOps.push(syncResult);

          // Journal the additional platform sync
          const journalEntry = {
            revisionId: result.revisionId,
            timestamp: new Date().toISOString(),
            platform: syncResult.platform,
            configPath: syncResult.configPath,
            backupPath: syncResult.backupPath,
            operationCount: syncResult.operationCount
          };
          await appendFile(getSyncJournalPath(), `${JSON.stringify(journalEntry)}\n`, "utf8");
        }
      }

      lastAppliedAt = result.appliedAt;

      const allOps = [
        ...result.operations.map((operation) => ({
          platform: operation.platform,
          configPath: operation.configPath,
          backupPath: operation.backupPath,
          operationCount: operation.operationCount
        })),
        ...additionalOps
      ];

      await appendActivityEntry({
        type: "sync-apply",
        title: "Sync applied",
        detail: `Applied ${allOps.length} platform update(s). Revision: ${result.revisionId}.`
      });

      return {
        appliedAt: result.appliedAt,
        revisionId: result.revisionId,
        operations: allOps
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
        throw new Error("Assistant input is required.");
      }

      const suggestion = await analyzeInput(payload);

      await appendActivityEntry({
        type: "assistant-analysis",
        title: "Assistant analyzed MCP source",
        detail: `${suggestion.suggestedName} via ${suggestion.provider} (${suggestion.mode}).`
      });

      return suggestion;
    }
  );

  ipcMain.handle(
    IPCChannels.modelGetStatus,
    async (): Promise<ModelStatusResponse> => {
      return doGetModelStatus();
    }
  );

  ipcMain.handle(
    IPCChannels.modelDownload,
    async (): Promise<ModelStatusResponse> => {
      return doDownloadModel();
    }
  );

  // Custom platform CRUD
  ipcMain.handle(
    IPCChannels.customPlatformAdd,
    async (_event, payload: CustomPlatformAddRequest): Promise<CustomPlatformEntry> => {
      if (!payload || !payload.name?.trim() || !payload.configPath?.trim()) {
        throw new Error("Custom platform requires a name and config path.");
      }
      return addCustomPlatform(payload);
    }
  );

  ipcMain.handle(
    IPCChannels.customPlatformRemove,
    async (_event, payload: CustomPlatformRemoveRequest): Promise<void> => {
      if (!payload || !payload.id?.trim()) {
        throw new Error("Custom platform removal requires an id.");
      }
      return removeCustomPlatform(payload);
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
