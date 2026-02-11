import { randomUUID } from "node:crypto";
import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";

import {
  PLATFORM_ORDER,
  type AdapterMap,
  type AppliedOperation,
  type ApplySyncPlanOptions,
  type ApplySyncPlanResult,
  type SyncJournalEntry,
  type SyncPlan
} from "./models";
import { rollbackFromBackups } from "./rollback";

export class SyncApplyError extends Error {
  public readonly operations: AppliedOperation[];
  public readonly rollbackError?: Error;

  public constructor(message: string, operations: AppliedOperation[], rollbackError?: Error) {
    super(message, { cause: rollbackError });
    this.name = "SyncApplyError";
    this.operations = operations;
    this.rollbackError = rollbackError;
  }
}

function defaultJournalPath(): string {
  return path.join(process.cwd(), ".mcp-gateway", "sync-journal.jsonl");
}

async function appendJournalEntry(journalPath: string, entry: SyncJournalEntry): Promise<void> {
  await mkdir(path.dirname(journalPath), { recursive: true });
  await appendFile(journalPath, `${JSON.stringify(entry)}\n`, "utf8");
}

export async function applySyncPlan(
  plan: SyncPlan,
  adapters: AdapterMap,
  options?: ApplySyncPlanOptions
): Promise<ApplySyncPlanResult> {
  const operations: AppliedOperation[] = [];
  const journalPath = options?.journalPath ?? defaultJournalPath();
  const revisionId = randomUUID();

  for (const platform of PLATFORM_ORDER) {
    const platformPlan = plan.byPlatform[platform];

    if (!platformPlan.hasChanges) {
      continue;
    }

    const adapter = adapters[platform];
    const backup = await adapter.backup(platformPlan.configPath);

    try {
      await adapter.writeAtomic(platformPlan.configPath, platformPlan.nextConfig);

      const operation: AppliedOperation = {
        revisionId,
        platform,
        configPath: platformPlan.configPath,
        backupPath: backup.backupPath,
        operationCount: platformPlan.operations.length,
        appliedAt: new Date().toISOString()
      };

      operations.push(operation);

      await appendJournalEntry(journalPath, {
        revisionId: operation.revisionId,
        timestamp: operation.appliedAt,
        platform: operation.platform,
        configPath: operation.configPath,
        backupPath: operation.backupPath,
        operationCount: operation.operationCount
      });
    } catch (error) {
      const recoveryOperations = [
        ...operations,
        {
          revisionId,
          platform,
          configPath: platformPlan.configPath,
          backupPath: backup.backupPath,
          operationCount: platformPlan.operations.length,
          appliedAt: new Date().toISOString()
        }
      ];

      try {
        await rollbackFromBackups(recoveryOperations);
      } catch (rollbackError) {
        const rollbackAsError =
          rollbackError instanceof Error
            ? rollbackError
            : new Error("Unknown rollback failure after apply error.");

        throw new SyncApplyError(
          `Apply failed on ${platform} and rollback also failed: ${rollbackAsError.message}`,
          operations,
          rollbackAsError
        );
      }

      const applyErrorMessage = error instanceof Error ? error.message : "Unknown apply error";
      throw new SyncApplyError(`Apply failed on ${platform}: ${applyErrorMessage}`, operations);
    }
  }

  return {
    appliedAt: new Date().toISOString(),
    revisionId,
    operations
  };
}
