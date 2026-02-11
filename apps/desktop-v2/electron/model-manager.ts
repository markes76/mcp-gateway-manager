/**
 * Manages the local LLM model lifecycle: status checks, downloading, and loading.
 * Uses node-llama-cpp for inference with Qwen 2.5 1.5B Instruct.
 *
 * Download runs in the background with progress tracking. Navigating away
 * from the Settings page and back will resume showing progress.
 */

import { access, stat } from "node:fs/promises";
import path from "node:path";

import { app } from "electron";

import type { ModelStatusResponse } from "@mcp-gateway/ipc-contracts";

const MODEL_FILENAME = "qwen2.5-1.5b-instruct-q4_k_m.gguf";
const MODEL_HF_REPO = "Qwen/Qwen2.5-1.5B-Instruct-GGUF";
const MODEL_HF_FILE = "qwen2.5-1.5b-instruct-q4_k_m.gguf";
const MODEL_DISPLAY_NAME = "Qwen 2.5 1.5B Instruct (Q4_K_M)";

// ── Singleton download progress state ──────────────────────────────
interface DownloadState {
  active: boolean;
  downloadedBytes: number;
  totalBytes: number;
  error: string | null;
}

const dlState: DownloadState = {
  active: false,
  downloadedBytes: 0,
  totalBytes: 0,
  error: null
};

// ── Helpers ────────────────────────────────────────────────────────

function getModelsDir(): string {
  return path.join(app.getPath("userData"), "models");
}

export function getModelPath(): string {
  return path.join(getModelsDir(), MODEL_FILENAME);
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

// ── Public API ─────────────────────────────────────────────────────

export async function getModelStatus(): Promise<ModelStatusResponse> {
  const modelPath = getModelPath();
  const exists = await fileExists(modelPath);

  let sizeBytes: number | null = null;
  if (exists) {
    try {
      const info = await stat(modelPath);
      sizeBytes = info.size;
    } catch {
      // Ignore stat errors
    }
  }

  const progress =
    dlState.totalBytes > 0 ? dlState.downloadedBytes / dlState.totalBytes : 0;

  return {
    downloaded: exists,
    modelName: MODEL_DISPLAY_NAME,
    modelPath,
    sizeBytes,
    downloading: dlState.active,
    downloadProgress: Math.min(progress, 1),
    downloadedBytes: dlState.downloadedBytes,
    totalBytes: dlState.totalBytes,
    downloadError: dlState.error
  };
}

/**
 * Starts the model download in the background.
 * Returns immediately with the current status.
 * Subsequent calls to getModelStatus() will reflect progress.
 * Calling while already downloading is a no-op.
 */
export async function downloadModel(): Promise<ModelStatusResponse> {
  // Already downloaded
  if (await fileExists(getModelPath())) {
    return getModelStatus();
  }

  // Already downloading — just return current progress
  if (dlState.active) {
    return getModelStatus();
  }

  // Reset state and kick off background download
  dlState.active = true;
  dlState.downloadedBytes = 0;
  dlState.totalBytes = 0;
  dlState.error = null;

  // Fire-and-forget — the promise resolves/rejects in the background
  (async () => {
    try {
      const { createModelDownloader } = await import("node-llama-cpp");

      const downloader = await createModelDownloader({
        modelUri: `hf:${MODEL_HF_REPO}/${MODEL_HF_FILE}`,
        dirPath: getModelsDir(),
        fileName: MODEL_FILENAME,
        onProgress({ totalSize, downloadedSize }) {
          dlState.totalBytes = totalSize;
          dlState.downloadedBytes = downloadedSize;
        }
      });

      // Seed totalBytes from downloader metadata before download starts
      if (downloader.totalSize > 0) {
        dlState.totalBytes = downloader.totalSize;
      }

      await downloader.download();

      dlState.active = false;
      dlState.error = null;
    } catch (err) {
      dlState.active = false;
      dlState.error = err instanceof Error ? err.message : "Download failed.";
    }
  })();

  return getModelStatus();
}

// ── LLM session management (unchanged) ─────────────────────────────

let llamaSession: {
  prompt: (text: string, options?: Record<string, unknown>) => Promise<string>;
  dispose?: () => void;
} | null = null;

let llamaGrammar: unknown = null;
let loadingPromise: Promise<void> | null = null;

export async function ensureModelLoaded(): Promise<void> {
  if (llamaSession) return;
  if (loadingPromise) return loadingPromise;

  loadingPromise = (async () => {
    const modelPath = getModelPath();

    if (!(await fileExists(modelPath))) {
      throw new Error("Model not downloaded. Call downloadModel() first.");
    }

    const { getLlama, LlamaChatSession } = await import("node-llama-cpp");
    const { MCP_CONFIG_JSON_SCHEMA } = await import("./mcp-prompt.js");

    const llama = await getLlama();
    const model = await llama.loadModel({ modelPath });
    const context = await model.createContext();

    llamaGrammar = await llama.createGrammarForJsonSchema(MCP_CONFIG_JSON_SCHEMA as never);

    const session = new LlamaChatSession({
      contextSequence: context.getSequence()
    });

    llamaSession = {
      prompt: (text: string, options?: Record<string, unknown>) =>
        session.prompt(text, options),
      dispose: () => {
        context.dispose();
        model.dispose();
      }
    };
  })();

  return loadingPromise;
}

export async function promptModel(userMessage: string): Promise<string> {
  await ensureModelLoaded();

  if (!llamaSession) {
    throw new Error("Model failed to load.");
  }

  return llamaSession.prompt(userMessage, {
    grammar: llamaGrammar,
    maxTokens: 512,
    temperature: 0.1
  });
}

export function isModelLoaded(): boolean {
  return llamaSession !== null;
}
