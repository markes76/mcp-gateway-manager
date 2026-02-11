# MCP Gateway Manager

![MCP Gateway Manager logo](./logo.png)

**One app to manage all your MCP servers across every AI platform.**

Version: **2.1.0**
License: **MIT**

---

## Why this exists

Every AI coding tool has its own MCP config file in a different location with a slightly different format. Adding, updating, or removing an MCP server means editing JSON files by hand across multiple platforms. MCP Gateway Manager eliminates that fragmentation.

**One matrix. All platforms. Instant sync.**

## What's new in v2.1

- **10 platforms supported** — Claude, Cursor, Codex (built-in) plus Windsurf, VS Code, Zed, Continue, Cline, Roo Code, and Docker Desktop (auto-discovered).
- **Auto-discovery** — On launch, the app scans your machine for known platform config files and adds them to the matrix automatically.
- **Custom platforms** — Point to any application's MCP JSON config file and give it a name. It joins the sync matrix instantly.
- **Dynamic matrix** — The server grid, platform toggles, sync preview, and status bar all adapt to however many platforms you have.

### What shipped in v2.0

- **Local AI model** — A built-in Qwen 2.5 1.5B model analyzes MCP packages and auto-fills configuration. Runs entirely on your machine. No API keys, no cloud, completely free.
- **Smart + Manual modes** — Paste a URL for AI-assisted setup, or fill in the config manually if you know what you're doing.
- **Redesigned UI** — Clean, enterprise-grade interface built from scratch with a new design system.
- **Help guide** — Built-in documentation explaining every feature.
- **Download progress** — Model downloads run in the background with real-time progress tracking.
- **Installable app** — DMG for macOS (drag to Applications), NSIS installer for Windows, AppImage for Linux.

## Core features

| Feature | Description |
|---------|-------------|
| **Unified Matrix** | Add MCP servers once, sync to all platforms simultaneously |
| **Auto-Discovery** | Windsurf, VS Code, Zed, Continue, Cline, Roo Code, Docker Desktop detected automatically |
| **Custom Platforms** | Add any app that uses a JSON MCP config — name it, point to the file, done |
| **Smart Analysis** | Paste a URL or npm package — AI reads the docs and pre-fills command, args, and env vars |
| **Manual Config** | Power users can fill in server configs directly without AI |
| **Preview & Apply** | See exactly what changes will be written before applying them |
| **Automatic Backups** | Every sync creates a backup. One-click revert from the Activity page |
| **Per-Platform Control** | Enable/disable servers globally or per platform |
| **Activity Timeline** | Full history of syncs, reverts, analyses, and config changes |
| **Local AI Model** | ~900 MB download, Apache 2.0 license, runs offline via node-llama-cpp |
| **Platform Restart** | Restart Claude/Cursor from the app after syncing |

## Screenshots

> Launch the app with `pnpm dev` from `apps/desktop-v2/` to see the UI.

## Architecture

```
apps/
  desktop-v2/          # Electron + React + TypeScript (v2 — current)
    electron/
      main.ts          # Main process — IPC handlers, platform registry, sync
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
5. Select target platforms (all or specific)
6. Click **Add to Matrix**

### Adding an MCP server (Manual mode)

1. Go to **Sync** tab, select **Manual** toggle
2. Fill in server name, command (e.g. `npx`), and arguments
3. Select target platforms
4. Click **Add to Matrix**

### Syncing to platforms

1. Click **Preview** to see what changes will be written to each platform
2. Review the operation count per platform
3. Click **Apply Sync** — configs are written, backups are created automatically

### Adding a custom platform

1. Go to **Settings** > **Custom Platforms**
2. Enter a name for the application (e.g. "My IDE")
3. Enter or browse to the JSON config file path
4. Click **Add** — the platform appears in the matrix immediately

### AI Model

The local AI model is optional but recommended. It runs entirely on your machine:

- **Model:** Qwen 2.5 1.5B Instruct (Q4_K_M)
- **Size:** ~900 MB download
- **License:** Apache 2.0
- **Runtime:** node-llama-cpp (llama.cpp via N-API)
- **Download:** Settings > AI Model > Download

The model uses grammar-constrained output (GBNF JSON schema) to guarantee valid structured responses. Without it, Smart mode falls back to URL pattern matching.

## Supported platforms

### Built-in (dedicated adapters)

| Platform | Config location | Restart support |
|----------|----------------|-----------------|
| **Claude** | `~/.claude/claude_desktop_config.json` | Yes |
| **Cursor** | `~/.cursor/mcp.json` | Yes |
| **Codex** | `~/.codex/config.json` | No (protects active sessions) |

### Auto-discovered (detected on launch)

| Platform | Config location (macOS) | Config key |
|----------|------------------------|------------|
| **Windsurf** | `~/.codeium/windsurf/mcp_config.json` | `mcpServers` |
| **VS Code** | `~/Library/Application Support/Code/User/mcp.json` | `servers` |
| **Zed** | `~/.config/zed/settings.json` | `context_servers` |
| **Continue** | `~/.continue/config.json` | `mcpServers` |
| **Cline** | `~/Library/Application Support/Code/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json` | `mcpServers` |
| **Roo Code** | `~/Library/Application Support/Code/User/globalStorage/rooveterinaryinc.roo-cline/settings/mcp_settings.json` | `mcpServers` |
| **Docker Desktop** | `~/.docker/mcp.json` | `mcpServers` |

Windows and Linux paths are also supported — the app checks OS-specific candidates automatically.

### Custom platforms

Any application that stores MCP servers in a JSON config file can be added via **Settings > Custom Platforms**. Provide a name and the config file path. The app reads and writes the `mcpServers` key by default, preserving all other content in the file.

Config paths for built-in platforms can be overridden in Settings > Platform Config Paths.

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

## Logo & app icon

- Source: `logo.png` (1024x1024, repo root)
- macOS: `apps/desktop-v2/build/icon.icns` + `icon.iconset/`
- Windows/Linux: `apps/desktop-v2/build/icon.png`

The logo is used as the application icon (dock, taskbar, installer). It is not displayed inside the app UI.

## License

MIT. See [LICENSE](./LICENSE).
