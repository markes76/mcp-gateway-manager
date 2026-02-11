import { isPlatformMcpConfig, validatePlatformMcpConfig, type PlatformMcpConfig } from "@mcp-gateway/domain";

import { createTimestampedBackup, pathExists, readUtf8, writeJsonAtomic } from "./file-ops";
import {
  AdapterError,
  type AdapterErrorCode,
  type AdapterPathOptions,
  type BackupResult,
  type DetectResult,
  type PlatformAdapter,
  type PlatformName,
  type ReadResult,
  type ValidationResult
} from "./types";

interface JsonAdapterOptions {
  platform: PlatformName;
  defaultCandidates: () => string[];
}

interface ErrnoLike {
  code?: string;
}

function getErrnoCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null) {
    return undefined;
  }

  const maybeErr = error as ErrnoLike;
  return typeof maybeErr.code === "string" ? maybeErr.code : undefined;
}

function mapIoError(code: string | undefined): AdapterErrorCode {
  if (code === "ENOENT") {
    return "FILE_NOT_FOUND";
  }

  return "IO_ERROR";
}

export class JsonPlatformAdapter implements PlatformAdapter {
  public readonly platform: PlatformName;
  private readonly defaultCandidates: () => string[];

  public constructor(options: JsonAdapterOptions) {
    this.platform = options.platform;
    this.defaultCandidates = options.defaultCandidates;
  }

  public defaultConfigCandidates(): string[] {
    return this.defaultCandidates();
  }

  public async detect(options?: AdapterPathOptions): Promise<DetectResult> {
    const searchedPaths =
      options?.overridePaths && options.overridePaths.length > 0
        ? options.overridePaths
        : this.defaultConfigCandidates();

    for (const configPath of searchedPaths) {
      if (await pathExists(configPath)) {
        return {
          platform: this.platform,
          found: true,
          path: configPath,
          searchedPaths
        };
      }
    }

    return {
      platform: this.platform,
      found: false,
      path: null,
      searchedPaths
    };
  }

  public validate(config: unknown): ValidationResult {
    const errors = validatePlatformMcpConfig(config);
    return {
      valid: errors.length === 0,
      errors
    };
  }

  public async read(configPath: string): Promise<ReadResult> {
    let raw: string;
    try {
      raw = await readUtf8(configPath);
    } catch (error) {
      throw new AdapterError({
        code: mapIoError(getErrnoCode(error)),
        platform: this.platform,
        message: `Failed to read ${this.platform} config at '${configPath}'.`,
        targetPath: configPath,
        cause: error
      });
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      throw new AdapterError({
        code: "MALFORMED_JSON",
        platform: this.platform,
        message: `Config at '${configPath}' is not valid JSON.`,
        targetPath: configPath,
        cause: error
      });
    }

    if (!isPlatformMcpConfig(parsed)) {
      const validation = this.validate(parsed);
      throw new AdapterError({
        code: "INVALID_CONFIG",
        platform: this.platform,
        message: `Config at '${configPath}' failed validation: ${validation.errors.join(" ")}`,
        targetPath: configPath
      });
    }

    return {
      platform: this.platform,
      path: configPath,
      config: parsed,
      raw
    };
  }

  public async backup(configPath: string): Promise<BackupResult> {
    try {
      const backupPath = await createTimestampedBackup(configPath);
      return {
        platform: this.platform,
        sourcePath: configPath,
        backupPath,
        createdAt: new Date().toISOString()
      };
    } catch (error) {
      throw new AdapterError({
        code: mapIoError(getErrnoCode(error)),
        platform: this.platform,
        message: `Failed to create backup for '${configPath}'.`,
        targetPath: configPath,
        cause: error
      });
    }
  }

  public async writeAtomic(configPath: string, config: PlatformMcpConfig): Promise<void> {
    const validation = this.validate(config);

    if (!validation.valid) {
      throw new AdapterError({
        code: "INVALID_CONFIG",
        platform: this.platform,
        message: `Cannot write invalid ${this.platform} config: ${validation.errors.join(" ")}`,
        targetPath: configPath
      });
    }

    try {
      await writeJsonAtomic(configPath, config);
    } catch (error) {
      throw new AdapterError({
        code: mapIoError(getErrnoCode(error)),
        platform: this.platform,
        message: `Failed atomic write for '${configPath}'.`,
        targetPath: configPath,
        cause: error
      });
    }
  }
}
