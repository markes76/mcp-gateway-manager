import type { PlatformMcpConfig } from "@mcp-gateway/domain";

export type PlatformName = "claude" | "cursor" | "codex";

export type AdapterErrorCode = "FILE_NOT_FOUND" | "MALFORMED_JSON" | "INVALID_CONFIG" | "IO_ERROR";

export interface AdapterPathOptions {
  overridePaths?: string[];
}

export interface DetectResult {
  platform: PlatformName;
  found: boolean;
  path: string | null;
  searchedPaths: string[];
}

export interface ReadResult {
  platform: PlatformName;
  path: string;
  config: PlatformMcpConfig;
  raw: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export interface BackupResult {
  platform: PlatformName;
  sourcePath: string;
  backupPath: string;
  createdAt: string;
}

export interface PlatformAdapter {
  readonly platform: PlatformName;
  defaultConfigCandidates(): string[];
  detect(options?: AdapterPathOptions): Promise<DetectResult>;
  read(configPath: string): Promise<ReadResult>;
  validate(config: unknown): ValidationResult;
  backup(configPath: string): Promise<BackupResult>;
  writeAtomic(configPath: string, config: PlatformMcpConfig): Promise<void>;
}

export class AdapterError extends Error {
  public readonly code: AdapterErrorCode;
  public readonly platform: PlatformName;
  public readonly targetPath?: string;

  public constructor(params: {
    code: AdapterErrorCode;
    platform: PlatformName;
    message: string;
    targetPath?: string;
    cause?: unknown;
  }) {
    super(params.message, { cause: params.cause });
    this.name = "AdapterError";
    this.code = params.code;
    this.platform = params.platform;
    this.targetPath = params.targetPath;
  }
}
