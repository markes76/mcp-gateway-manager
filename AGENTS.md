# AGENTS.md

## Mission
Build MCP Gateway Manager as a local-first desktop control plane for MCP configuration across Claude, Cursor, and Codex.

## Engineering Rules
- Keep strict TypeScript in all packages.
- Use typed IPC contracts between renderer and Electron main/preload.
- Never write platform configs without backup-first plus atomic write semantics.
- Keep sync behavior deterministic and idempotent for the same input.
- Do not auto-execute downloaded MCP scripts.

## Package Boundaries
- `apps/desktop`: UI shell and Electron runtime integration.
- `packages/domain`: canonical types and validators.
- `packages/ipc-contracts`: channel names and payload contracts.
- `packages/platform-adapters`: per-platform config discovery/read/validate/backup/write.
- `packages/sync-engine`: plan, apply, rollback, and sync journaling.
- `packages/assistant`: Codex Internal provider and assistant URL intake.

## Definition Of Done
- `pnpm typecheck` passes.
- `pnpm lint` passes.
- `pnpm test` passes.
- `pnpm build` passes.
- New behavior includes tests for success and failure paths.

## Prohibited
- Partial writes without backup.
- Untyped cross-process payloads.
- Silent error swallowing.
- Hardcoded machine-specific secrets.
