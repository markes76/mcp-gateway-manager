import { randomUUID } from "node:crypto";
import { access, copyFile, mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

export async function pathExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function readUtf8(filePath: string): Promise<string> {
  return readFile(filePath, "utf8");
}

export async function createTimestampedBackup(
  sourcePath: string,
  now: () => Date = () => new Date()
): Promise<string> {
  const stamp = now().toISOString().replace(/[.:]/g, "-");
  const backupPath = `${sourcePath}.bak.${stamp}`;
  await copyFile(sourcePath, backupPath);
  return backupPath;
}

export async function writeJsonAtomic(targetPath: string, data: unknown): Promise<void> {
  const directory = path.dirname(targetPath);
  const fileName = path.basename(targetPath);
  const tempPath = path.join(directory, `.${fileName}.${process.pid}.${randomUUID()}.tmp`);

  await mkdir(directory, { recursive: true });
  await writeFile(tempPath, `${JSON.stringify(data, null, 2)}\n`, "utf8");

  try {
    await rename(tempPath, targetPath);
  } catch (error) {
    await unlink(tempPath).catch(() => undefined);
    throw error;
  }
}
