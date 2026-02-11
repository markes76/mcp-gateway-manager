# MCP Gateway Manager

![MCP Gateway Manager logo](./logo.png)

MCP Gateway Manager is a local-first desktop app that centralizes MCP server configuration for Claude, Cursor, and Codex.

Version: **1.0.0**  
License: **MIT**

## Why this exists

Managing MCPs across multiple AI tools is fragmented and error-prone. MCP Gateway Manager gives you one control surface to:
- Share MCPs across platforms.
- Keep selected MCPs platform-specific.
- Enable/disable globally or per platform.
- Safely preview and apply changes with backups.
- Analyze MCP docs/URLs with AI and prefill configuration.

## Core features

- Unified Platform Matrix for Claude, Cursor, and Codex.
- Assistant intake flow for URL/doc-based MCP onboarding.
- Config merge support across default + additional path sources.
- Preview Sync before write.
- Apply Sync with rollback-aware operations and backup files.
- Activity log for assistant analysis, settings changes, sync apply, and restarts.
- Safety-first restart automation:
  - Claude/Cursor can be restarted from the app.
  - Codex is intentionally excluded from auto-restart to avoid interrupting active sessions.

## Workspace layout

- `apps/desktop`: Electron + React GUI.
- `packages/domain`: canonical domain types and validation.
- `packages/ipc-contracts`: typed IPC channel names and payloads.
- `packages/platform-adapters`: Claude/Cursor/Codex config adapters.
- `packages/sync-engine`: sync planning, apply, rollback, journaling.
- `packages/assistant`: Codex Internal provider + deterministic fallback URL intake.

## Requirements

- macOS (current release packaging target)
- Node.js 20+
- pnpm 9+

## Quick start

From workspace root:

```bash
pnpm install
pnpm dev
```

## Full quality + build pipeline

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm package:mac:dmg
```

Artifacts are produced under:
- `apps/desktop/release/`

## Install app to Applications

```bash
pnpm install:mac
```

Then launch:

```bash
open -a '/Applications/MCP Gateway Manager.app'
```

## Logo and app icon pipeline

- Source logo: `logo.png` (repo root)
- Desktop UI asset: `apps/desktop/src/assets/logo.png`
- macOS icon output: `apps/desktop/build/icon.icns`
- Generator script: `apps/desktop/scripts/generate-macos-icon.sh`

The icon generation runs automatically during:
- `pnpm --filter @mcp-gateway/desktop package:mac`
- `pnpm --filter @mcp-gateway/desktop package:mac:dmg`

## Public GitHub setup

After creating a public repository, push this project:

```bash
git init
git add .
git commit -m "release: v1.0.0"
git branch -M main
git remote add origin <your-github-repo-url>
git push -u origin main
```

## License

MIT. See `LICENSE`.
