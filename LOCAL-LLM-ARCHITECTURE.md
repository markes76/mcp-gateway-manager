# Local LLM Architecture: Self-Service MCP Installation

## Executive Summary

Replace all paid cloud AI providers (OpenAI, Anthropic, Gemini, Bedrock) with a single **free, local LLM** that ships with the app. Zero API keys. Zero cloud dependency. Full self-service MCP installation from any input format.

---

## Model Selection

### Primary: Qwen 2.5 1.5B Instruct (GGUF Q4_K_M)

| Property | Value |
|----------|-------|
| Parameters | 1.5 billion |
| Disk size | ~900 MB |
| License | Apache 2.0 (full commercial use, no restrictions) |
| Speed (Apple Silicon) | 30-40 tokens/sec |
| Speed (Intel Mac 8GB) | 15-20 tokens/sec |
| Typical query time | 2-3 seconds |
| Context window | 32K tokens |
| JSON structured output | Best-in-class at this size |
| Download | `Qwen/Qwen2.5-1.5B-Instruct-GGUF` from Hugging Face |

### Why This Model

1. **Smallest viable model** for reliable structured JSON extraction from README text
2. **Apache 2.0** — zero legal risk, no attribution burden, no usage caps
3. **Grammar-constrained output** via GBNF ensures valid JSON every single time
4. **Sub-1GB download** — comparable to shipping Chromium itself
5. **Proven Electron integration** via `node-llama-cpp` with official scaffold template

### Fallback: Qwen 2.5 0.5B Instruct (for constrained hardware)

| Property | Value |
|----------|-------|
| Disk size | ~400 MB |
| Speed | 60-80 tokens/sec |
| Use when | Machine has < 8GB RAM or user prefers smaller download |

---

## Runtime: node-llama-cpp

`node-llama-cpp` is the Node.js binding for llama.cpp — the industry-standard local inference engine.

- Native C++ bindings via N-API (not subprocess)
- Automatic Metal acceleration on macOS
- Full TypeScript types
- **GBNF grammar support** — force model to output JSON matching an exact schema
- Official Electron integration guide and ASAR bundling support
- Runs in Electron **main process only** (not renderer)

### Installation

```bash
pnpm add node-llama-cpp
```

The model GGUF file ships in `resources/models/` and is excluded from ASAR via electron-builder config.

---

## Three-Layer Architecture

```
User Input (URL, npm name, npx command, free text)
       │
       ▼
┌─────────────────────────────────┐
│  Layer 1: Deterministic Parser  │  ← Instant, no model, always runs first
│  (existing url-intake.ts)       │
│                                 │
│  • npm URL → npx -y <package>   │
│  • GitHub URL → owner/repo      │
│  • Keyword env var detection    │
│  • Name sanitization            │
└──────────┬──────────────────────┘
           │ produces "base suggestion"
           ▼
┌─────────────────────────────────┐
│  Layer 2: Local LLM Enhancement │  ← 2-3 seconds, enriches base suggestion
│  (new local-llm-provider.ts)    │
│                                 │
│  • Fetches README/docs from URL │
│  • Feeds to Qwen 2.5 1.5B      │
│  • Grammar-constrained JSON out │
│  • Merges with base suggestion  │
│  • Detects correct command      │
│  • Finds ALL env vars from docs │
│  • Generates human summary      │
└──────────┬──────────────────────┘
           │ produces "enhanced suggestion"
           ▼
┌─────────────────────────────────┐
│  Layer 3: User Confirmation UI  │  ← User reviews and confirms
│                                 │
│  • Shows: name, command, args   │
│  • Shows: env vars to fill      │
│  • Shows: platform targets      │
│  • "Confirm & Install" button   │
│  • OR "Edit Manually" toggle    │
└─────────────────────────────────┘
```

### Layer 1: Deterministic Parser (KEEP AS-IS)

The existing `inferSuggestionFromUrl()` in `url-intake.ts` is excellent. It:
- Handles 80% of cases correctly with zero latency
- Works completely offline
- Has zero dependencies
- Provides the "base suggestion" that Layer 2 can refine

**No changes needed.** This layer stays.

### Layer 2: Local LLM Enhancement (NEW)

New file: `packages/assistant/src/providers/local-llm.ts`

```typescript
import { getLlama, LlamaChatSession } from "node-llama-cpp";

export class LocalLlmProvider implements AssistantProvider {
  private session: LlamaChatSession | null = null;
  private modelPath: string;
  private loading: Promise<void> | null = null;

  constructor(modelPath: string) {
    this.modelPath = modelPath;
  }

  async initialize(): Promise<void> {
    if (this.session) return;
    if (this.loading) return this.loading;

    this.loading = (async () => {
      const llama = await getLlama();
      const model = await llama.loadModel({ modelPath: this.modelPath });
      const context = await model.createContext();
      this.session = new LlamaChatSession({
        contextSequence: context.getSequence()
      });
    })();

    return this.loading;
  }

  async suggestFromUrl(
    input: string,
    baseSuggestion: AssistantUrlSuggestion,
    docsExcerpt: string
  ): Promise<AssistantUrlSuggestion> {
    await this.initialize();

    const grammar = await this.createMcpGrammar();
    const prompt = this.buildPrompt(input, baseSuggestion, docsExcerpt);

    const result = await this.session!.prompt(prompt, {
      grammar,
      maxTokens: 512,
      temperature: 0.1
    });

    const parsed = JSON.parse(result); // Grammar guarantees valid JSON
    return this.mergeWithBase(baseSuggestion, parsed);
  }
}
```

**The Grammar (GBNF via JSON Schema):**

```typescript
const mcpConfigSchema = {
  type: "object",
  properties: {
    suggestedName: { type: "string" },
    suggestedCommand: { type: "string" },
    suggestedArgs: { type: "array", items: { type: "string" } },
    requiredEnvVars: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          required: { type: "boolean" },
          description: { type: "string" }
        },
        required: ["name", "required", "description"]
      }
    },
    installCommand: { type: "string" },
    summary: { type: "string" }
  },
  required: ["suggestedName", "suggestedCommand", "suggestedArgs", "summary"]
};
```

This grammar is enforced at the token level by llama.cpp — the model **cannot** produce invalid JSON. This eliminates all parsing failures.

**The System Prompt:**

```
You are an MCP server configuration assistant embedded in a desktop app.

Given a user's input (URL, package name, or description) and optionally
a README excerpt, extract the correct MCP server configuration.

Rules:
- suggestedName: lowercase, kebab-case server name
- suggestedCommand: the runtime command (npx, node, python, uvx, docker, etc.)
- suggestedArgs: array of arguments EXACTLY as they should appear
- requiredEnvVars: ALL environment variables mentioned in the docs
- installCommand: one-line install command if needed (e.g., "npm install -g @package/name")
- summary: one sentence describing what this MCP server does

Be precise. Prefer npx -y for npm packages. Use uvx for Python packages.
If the README shows a specific command, use that exact command.
```

### Layer 3: User Confirmation + Manual Config UI

The Sync page gets a redesigned "Add MCP" section with two modes:

**Mode A: Smart Install (default)**
```
┌─────────────────────────────────────────────────────┐
│  Add MCP Server                                      │
│                                                      │
│  ┌─────────────────────────────────┐  ┌──────────┐  │
│  │ Paste URL, npm package, or desc │  │ Analyze  │  │
│  └─────────────────────────────────┘  └──────────┘  │
│                                                      │
│  ▼ Analysis Result                                   │
│  ┌─────────────────────────────────────────────────┐ │
│  │  ✓ filesystem-server                            │ │
│  │    Command: npx -y @modelcontextprotocol/fs     │ │
│  │    Env vars: none                               │ │
│  │    Platforms: Claude ✓  Cursor ✓  Codex ✓       │ │
│  │    ─────────────────────────────────────────     │ │
│  │    "Provides read/write access to local files"  │ │
│  │                                                 │ │
│  │    [ Edit Details ]     [ Confirm & Install ]   │ │
│  └─────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────┘
```

**Mode B: Manual Config (toggle)**
```
┌─────────────────────────────────────────────────────┐
│  Add MCP Server          [Smart ○] [Manual ●]        │
│                                                      │
│  Server Name    ┌──────────────────────────────────┐ │
│                 │ my-server                        │ │
│                 └──────────────────────────────────┘ │
│  Command        ┌──────────────────────────────────┐ │
│                 │ npx                              │ │
│                 └──────────────────────────────────┘ │
│  Arguments      ┌──────────────────────────────────┐ │
│                 │ -y @acme/mcp-server              │ │
│                 └──────────────────────────────────┘ │
│  Env Vars       ┌──────────────────────────────────┐ │
│                 │ + Add Variable                   │ │
│                 └──────────────────────────────────┘ │
│  Platforms      [Claude ✓] [Cursor ✓] [Codex ✓]     │
│                                                      │
│                              [ Add to Matrix ]       │
└─────────────────────────────────────────────────────┘
```

---

## Model Lifecycle

### First Launch: Model Download

On first app launch (or if model file is missing):

```
┌──────────────────────────────────────────────────┐
│  MCP Gateway needs to download a small AI model  │
│  for intelligent MCP server detection.           │
│                                                  │
│  Model: Qwen 2.5 1.5B (Apache 2.0 license)      │
│  Size:  ~900 MB                                  │
│  From:  Hugging Face                             │
│                                                  │
│  ━━━━━━━━━━━━━━━━━━━━ 45%                       │
│                                                  │
│  [ Download Now ]  [ Skip — use basic mode ]     │
└──────────────────────────────────────────────────┘
```

- Download happens in background via `node-llama-cpp` built-in model downloader
- Model stored in `app.getPath("userData")/models/`
- If user skips: Layer 1 (deterministic parser) still works — just no LLM enhancement
- Download progress exposed via IPC to renderer

### Model Loading

- Model loads lazily on first "Analyze" click (not at app startup)
- Loading takes 2-5 seconds; show spinner in UI
- Model stays in memory until app closes (~1.5GB RAM usage)
- If machine has < 6GB available RAM: fall back to 0.5B model or skip LLM

### App Size Impact

| Component | Size |
|-----------|------|
| Current app (Electron + renderer) | ~150 MB |
| Qwen 2.5 1.5B Q4 model | ~900 MB |
| node-llama-cpp native bindings | ~15 MB |
| **Total with model** | **~1.1 GB** |
| **Total without model (first launch)** | **~165 MB** |

The model downloads separately after first launch — the initial app download stays small.

---

## What Gets Removed

### From `packages/assistant/`:
- `providers/codex-internal.ts` → DELETE entirely
- All cloud provider invocation code (OpenAI, Anthropic, Gemini, Bedrock)
- All API response parsers (extractOpenAiTextPayload, etc.)

### From `packages/ipc-contracts/`:
- `AssistantBackendProvider` type — simplify to `"local" | "none"`
- `AssistantBackendConfig` — remove apiKey, endpoint, model fields

### From Settings UI:
- Remove "Assistant Backend" section (provider dropdown, API key, model, endpoint, strict mode)
- Add "AI Model" section showing: model status (downloaded/not), model size, re-download button

### Keep:
- `url-intake.ts` — the deterministic parser (Layer 1)
- `types.ts` — the `AssistantUrlSuggestion` interface (minor adjustments)
- All sync, backup, activity, revision logic — untouched

---

## New IPC Channels

```typescript
// Added to IPCChannels
modelStatus: "assistant:model-status"      // → { downloaded, path, sizeBytes }
modelDownload: "assistant:model-download"  // → starts download, returns progress
modelAnalyze: "assistant:analyze"          // → input string → enhanced suggestion
```

---

## File Changes Summary

| Action | File | What |
|--------|------|------|
| NEW | `packages/assistant/src/providers/local-llm.ts` | LocalLlmProvider class |
| NEW | `packages/assistant/src/providers/model-manager.ts` | Download, verify, load model |
| NEW | `packages/assistant/src/prompts/mcp-extraction.ts` | System prompt + grammar schema |
| DELETE | `packages/assistant/src/providers/codex-internal.ts` | Cloud provider code |
| MODIFY | `packages/assistant/src/index.ts` | Export LocalLlmProvider instead |
| MODIFY | `packages/assistant/src/types.ts` | Simplify provider types |
| MODIFY | `packages/ipc-contracts/src/channels.ts` | Add model IPC channels |
| MODIFY | `packages/ipc-contracts/src/types.ts` | Simplify assistant config types |
| MODIFY | `apps/desktop-v2/electron/main.ts` | Register model IPC handlers |
| MODIFY | `apps/desktop-v2/src/components/pages/SyncPage.tsx` | Smart/Manual toggle UI |
| MODIFY | `apps/desktop-v2/src/components/pages/SettingsPage.tsx` | Replace provider config with model status |
| ADD DEP | `packages/assistant/package.json` | `node-llama-cpp` dependency |
| ADD DEP | Root | Model GGUF file in resources |

---

## Implementation Sequence

1. **Add `node-llama-cpp` to assistant package** — verify it builds with electron-vite
2. **Create `model-manager.ts`** — download, verify checksum, load model
3. **Create `local-llm.ts`** — LocalLlmProvider with grammar-constrained output
4. **Create `mcp-extraction.ts`** — prompt template and JSON schema
5. **Wire IPC handlers** — model:status, model:download, model:analyze
6. **Update SyncPage UI** — Smart/Manual toggle, confirmation card
7. **Update SettingsPage** — Replace provider section with model status
8. **Delete cloud provider code** — Remove codex-internal.ts and all API parsers
9. **Test end-to-end** — URL → analyze → confirm → install flow
10. **Package** — Ensure model excluded from ASAR, electron-builder config updated
