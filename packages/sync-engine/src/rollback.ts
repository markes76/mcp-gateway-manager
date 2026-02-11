import { copyFile } from "node:fs/promises";

import type { AppliedOperation } from "./models";

export class RollbackError extends Error {
  public readonly failures: Array<{ configPath: string; backupPath: string; reason: string }>;

  public constructor(failures: Array<{ configPath: string; backupPath: string; reason: string }>) {
    super(`Rollback failed for ${failures.length} operation(s).`);
    this.name = "RollbackError";
    this.failures = failures;
  }
}

export async function rollbackFromBackups(operations: AppliedOperation[]): Promise<void> {
  const failures: Array<{ configPath: string; backupPath: string; reason: string }> = [];

  for (const operation of [...operations].reverse()) {
    try {
      await copyFile(operation.backupPath, operation.configPath);
    } catch (error) {
      failures.push({
        configPath: operation.configPath,
        backupPath: operation.backupPath,
        reason: error instanceof Error ? error.message : "Unknown rollback error"
      });
    }
  }

  if (failures.length > 0) {
    throw new RollbackError(failures);
  }
}
