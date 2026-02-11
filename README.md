# MCP Gateway Manager

![MCP Gateway Manager logo](./logo.png)

**One app to manage all your MCP servers across Claude, Cursor, and Codex.**

Version: **2.0.0**
License: **MIT**

---

## Why this exists

Every AI coding tool has its own MCP config file in a different location with a slightly different format. Adding, updating, or removing an MCP server means editing JSON files by hand across multiple platforms. MCP Gateway Manager eliminates that fragmentation.

**One matrix. All platforms. Instant sync.**

## What's new in v2

- **Local AI model** — A built-in Qwen 2.5 1.5B model analyzes MCP packages and auto-fills configuration. Runs entirely on your machine. No API keys, no cloud, completely free.
- **Smart + Manual modes** — Paste a URL for AI-assisted setup, or fill in the config manually if you know what you're doing.
- **Redesigned UI** — Clean, enterprise-grade interface built from scratch with a new design system.
- **Help guide** — Built-in documentation explaining every feature.
- **Download progress** — Model downloads run in the background with real-time progress tracking.
- **Installable app** — DMG for macOS (drag to Applications), NSIS installer for Windows, AppImage for Linux.

## Core features

| Feature | Description |
|---------|-------------|
| **Unified Matrix** | Add MCP servers once, sync to Claude, Cursor, and Codex simultaneously |
| **Smart Analysis** | Paste a URL or npm package — AI reads the docs and pre-fills command, args, and env vars |
| **Manual Config** | Power users can fill in server configs directly without AI |
| **Preview & Apply** | See exactly what changes will be written before applying them |
| **Automatic Backups** | Every sync creates a backup. One-click revert from the Activity page |
| **Per-Platform Control** | Enable/disable servers globally or per platform |
| **Activity Timeline** | Full history of syncs, reverts, analyses, and config changes |
| **Local AI Model** | ~900 MB download, Apache 2.0 license, runs offline via node-llama-cpp |
| **Platform Restart** | Restart Claude/Cursor from the app after syncing (Codex excluded to protect active sessions) |

## Screenshots

> Launch the app with `pnpm dev` from `apps/desktop-v2/` to see the UI.

## Architecture

```
apps/
  desktop-v2/          # Electron + React + TypeScript (v2 — current)
    electron/
      main.ts          # Main process — IPC handlers, window management
      preload.ts       # Context bridge — typed API for renderer
      local-llm.ts     # Two-layer MCP analysis (heuristic + AI)
      model-manager.ts # Model lifecycle — download, load, prompt
      mcp-prompt.ts    # System prompt + JSON schema for AI output
    src/
      components/      # React UI — layout, pages, shared components
      lib/             # Utilities — assistant, matrix, theme, shortcuts
      styles/          # Design tokens, globals, layout, components CSS
  desktop/             # v1 desktop app (preserved for reference)

packages/
  domain/              # Canonical types — MCPServerDefinition, ThemeMode
  ipc-contracts/       # Typed IPC channels, payloads, GatewayApi interface
  platform-adapters/   # Read/write adapters for Claude, Cursor, Codex configs
  sync-engine/         # Sync planning, diffing, applying, rollback, journaling
  assistant/           # URL parser + deterministic MCP config extraction
```

## Requirements

- **macOS** 12+ / **Windows** 10+ / **Linux** (x86_64, arm64)
- **Node.js** 20+
- **pnpm** 9+

## Quick start (development)

```bash
# Clone the repo
git clone https://github.com/markes76/mcp-gateway-manager.git
cd mcp-gateway-manager

# Install dependencies
pnpm install

# Start v2 in development mode
cd apps/desktop-v2
pnpm dev
```

The Electron window opens with hot reload enabled.

## Build & package

### macOS (.app + .dmg)

```bash
cd apps/desktop-v2
pnpm dist:mac
```

Output: `apps/desktop-v2/release/` — includes a `.dmg` with drag-to-Applications and a `.zip`.

### Windows (.exe installer)

```bash
cd apps/desktop-v2
pnpm dist:win
```

Output: `apps/desktop-v2/release/` — NSIS installer `.exe`.

### Linux (.AppImage)

```bash
cd apps/desktop-v2
pnpm dist
```

### Install to Applications (macOS — manual)

```bash
cp -R "apps/desktop-v2/release/mac-arm64/MCP Gateway Manager.app" /Applications/
open -a "MCP Gateway Manager"
```

## How it works

### Adding an MCP server (Smart mode)

1. Go to **Sync** tab, select **Smart** toggle
2. Paste a URL, npm package name, or GitHub repo
3. Click **Analyze** — the system parses the URL and (if AI model is downloaded) extracts the config
4. Review the pre-filled name, command, arguments, and env vars
5. Click **Add to Matrix**

### Adding an MCP server (Manual mode)

1. Go to **Sync** tab, select **Manual** toggle
2. Fill in server name, command (e.g. `npx`), and arguments
3. Select target platforms
4. Click **Add to Matrix**

### Syncing to platforms

1. Click **Preview** to see what changes will be written to each platform
2. Review the diff
3. Click **Apply Sync** — configs are written, backups are created automatically

### AI Model

The local AI model is optional but recommended. It runs entirely on your machine:

- **Model:** Qwen 2.5 1.5B Instruct (Q4_K_M)
- **Size:** ~900 MB download
- **License:** Apache 2.0
- **Runtime:** node-llama-cpp (llama.cpp via N-API)
- **Download:** Settings > AI Model > Download

The model uses grammar-constrained output (GBNF JSON schema) to guarantee valid structured responses. Without it, Smart mode falls back to URL pattern matching.

## Tech stack

| Layer | Technology |
|-------|-----------|
| Desktop runtime | Electron 33 |
| UI framework | React 18 |
| Language | TypeScript 5 |
| Build | Vite 6 + vite-plugin-electron |
| Styling | Custom design tokens + CSS (no framework) |
| State | React useState/useEffect (no external state lib) |
| AI inference | node-llama-cpp 3 (llama.cpp N-API bindings) |
| AI model | Qwen 2.5 1.5B Instruct Q4_K_M (GGUF) |
| Packaging | electron-builder 26 |
| Monorepo | pnpm workspaces |
| Testing | Vitest |

## Workspace scripts

From the monorepo root:

```bash
pnpm install          # Install all dependencies
pnpm typecheck        # TypeScript checks across all packages
pnpm lint             # ESLint across all packages
pnpm test             # Vitest across all packages
```

From `apps/desktop-v2/`:

```bash
pnpm dev              # Start dev mode with hot reload
pnpm build            # TypeCheck + Vite production build
pnpm dist:mac         # Build + package macOS DMG
pnpm dist:win         # Build + package Windows installer
pnpm dist             # Build + package for current platform
```

## Supported platforms

| Platform | Config location | Restart support |
|----------|----------------|-----------------|
| **Claude** | `~/.claude/claude_desktop_config.json` | Yes |
| **Cursor** | `~/.cursor/mcp.json` | Yes |
| **Codex** | `~/.codex/config.json` | No (protects active sessions) |

Config paths can be overridden in Settings > Platform Config Paths.

## Logo & app icon

- Source: `logo.png` (1024x1024, repo root)
- macOS: `apps/desktop-v2/build/icon.icns` + `icon.iconset/`
- Windows/Linux: `apps/desktop-v2/build/icon.png`

The logo is used as the application icon (dock, taskbar, installer). It is not displayed inside the app UI.

## License

MIT. See [LICENSE](./LICENSE).
