# Changelog

## 1.0.0 - 2026-02-11

Initial public release.

### Added
- Desktop control plane for MCP management across Claude, Cursor, and Codex.
- Assistant workflow that analyzes MCP URLs/docs and proposes near-ready configuration.
- Platform matrix with share/isolate controls and per-platform enable/disable toggles.
- Config path management with additional source paths and merge-aware reads.
- Sync preview and transactional apply flow with backup + rollback support.
- Activity log and sync journal for auditability.
- Safer restart automation with Codex excluded from auto-restart to avoid session interruption.
- macOS app icon generation pipeline sourced from repository `logo.png`.

### Stability and UX
- Fixed startup lifecycle issue where the desktop window could be released and app exit immediately.
- Improved restart prompts and messaging for non-technical users.
