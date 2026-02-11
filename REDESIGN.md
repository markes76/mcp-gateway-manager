# MCP Gateway Manager — UI/UX Redesign Specification

## What's Wrong Now (Root Causes)

| Problem | Current State | Why It Hurts |
|---------|--------------|--------------|
| Monolith | 2034-line App.tsx, all 8 pages inline | No component reuse, no design consistency |
| Over-navigation | 8 sidebar items for a single-purpose tool | Cognitive overload, dilutes core workflow |
| Eco palette | `#0f766e` teal accent, green-tinted surfaces | Reads "wellness app," not "developer infrastructure" |
| Gradient body | Radial gradient on body background | AI-generated-looking; enterprise apps use flat layers |
| Bubbly radius | `--radius-lg: 18px` | Consumer/mobile feel, not desktop-dense |
| Decorative font | Sora display font on metrics and headers | Over-styled for a utilitarian tool |
| No desktop DNA | No keyboard shortcuts, no context menus, no window state | Web app in an Electron wrapper |
| Responsive collapse | Sidebar becomes horizontal nav at 1024px | Desktop apps collapse sidebar to icons, never horizontal |

---

## Design Direction: "Quiet Infrastructure"

Reference apps: **Linear** (layout density), **Raycast** (surface treatment), **VS Code Settings** (information architecture for config UIs), **Vercel Dashboard** (clean data display).

The goal: the app should feel like infrastructure you trust — calm, dense, precise. No gradients, no decorative type, no bubbly corners. Every pixel earns its place.

---

## 1. Color System

### Light Theme

```css
:root {
  color-scheme: light;

  /* Surfaces — flat, layered, no gradients */
  --bg-base: #f7f8fa;
  --bg-surface: #ffffff;
  --bg-raised: #f0f1f3;
  --bg-sidebar: #f7f8fa;
  --bg-inset: #eceef1;
  --bg-overlay: rgba(0, 0, 0, 0.45);

  /* Text — neutral gray, high readability */
  --text-primary: #1a1d23;
  --text-secondary: #5c6370;
  --text-muted: #8b929e;
  --text-inverse: #ffffff;

  /* Accent — cold blue, not teal. Professional, not playful */
  --accent: #2563eb;
  --accent-hover: #1d4ed8;
  --accent-pressed: #1e40af;
  --accent-subtle: rgba(37, 99, 235, 0.08);
  --accent-muted: rgba(37, 99, 235, 0.15);

  /* Semantic */
  --success: #16a34a;
  --success-subtle: rgba(22, 163, 74, 0.1);
  --warning: #d97706;
  --warning-subtle: rgba(217, 119, 6, 0.1);
  --error: #dc2626;
  --error-subtle: rgba(220, 38, 38, 0.1);

  /* Borders */
  --border: #e2e4e9;
  --border-hover: #cdd0d5;
  --border-focus: var(--accent);

  /* Shadows — minimal, one level for floating only */
  --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.04);
  --shadow-md: 0 2px 8px rgba(0, 0, 0, 0.06);
  --shadow-focus: 0 0 0 2px var(--bg-surface), 0 0 0 4px var(--accent);
}
```

### Dark Theme

```css
:root[data-theme="dark"] {
  color-scheme: dark;

  --bg-base: #0e1015;
  --bg-surface: #16181d;
  --bg-raised: #1e2028;
  --bg-sidebar: #12141a;
  --bg-inset: #0a0c10;
  --bg-overlay: rgba(0, 0, 0, 0.6);

  --text-primary: #e1e4ea;
  --text-secondary: #8b929e;
  --text-muted: #5c6370;
  --text-inverse: #1a1d23;

  --accent: #3b82f6;
  --accent-hover: #60a5fa;
  --accent-pressed: #2563eb;
  --accent-subtle: rgba(59, 130, 246, 0.1);
  --accent-muted: rgba(59, 130, 246, 0.18);

  --border: #262830;
  --border-hover: #363840;

  --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.2);
  --shadow-md: 0 2px 8px rgba(0, 0, 0, 0.3);
}
```

**What changed:** Teal → blue. Green-tinted surfaces → neutral gray. Gradient body → flat `--bg-base`. Semantic colors sharpened.

---

## 2. Typography

```css
:root {
  --font-sans: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  --font-mono: "JetBrains Mono", "SF Mono", "Fira Code", monospace;

  /* Scale — desktop-dense, not web-spacious */
  --text-xs: 11px;
  --text-sm: 12px;
  --text-base: 13px;
  --text-md: 14px;
  --text-lg: 16px;
  --text-xl: 20px;
  --text-2xl: 24px;
}
```

**What changed:** Sora display font → eliminated. One font family (Inter) for everything. Base size 13px (was implicitly 16px web default). Monospace for config paths, commands, server names.

---

## 3. Spacing & Radius

```css
:root {
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-6: 24px;
  --space-8: 32px;

  --radius-sm: 4px;
  --radius-md: 6px;
  --radius-lg: 8px;
  --radius-full: 9999px;

  /* Layout fixed dimensions */
  --sidebar-width: 220px;
  --sidebar-collapsed: 52px;
  --titlebar-height: 38px;
  --statusbar-height: 28px;
}
```

**What changed:** `18px` radius → `8px` max. Spacing scale tightened. Fixed layout dimensions declared.

---

## 4. Information Architecture — Page Consolidation

### Current: 8 pages (too many)

```
Dashboard | Assistant | Platform Matrix | MCP Registry | Activity Log | Revisions | Settings | Help
```

### Proposed: 4 pages

```
Servers | Sync | Activity | Settings
```

| New Page | Absorbs | Rationale |
|----------|---------|-----------|
| **Servers** | Dashboard + MCP Registry + Platform Matrix | The core view. Shows all MCP servers in a unified matrix with platform columns. Dashboard metrics become a compact header strip. Registry is the matrix itself — no separate "registry" page. |
| **Sync** | Assistant + Sync Preview/Apply | The action view. "Add an MCP" assistant intake lives here alongside Preview and Apply. One place for all write operations. |
| **Activity** | Activity Log + Revisions | History view. Combine the activity log and revision history into a single timeline with filters. |
| **Settings** | Settings + Help | Configuration. Help content becomes a collapsible section inside settings, or a `?` button linking to docs. A "Help" page with static text doesn't earn a sidebar slot. |

### Sidebar Navigation

```
┌─────────────────────────┐
│ ⬡ MCP Gateway     v1.0  │  ← Logo + version, compact
├─────────────────────────┤
│                          │
│  ▸ Servers          (12) │  ← Badge: total server count
│  ▸ Sync                  │
│  ▸ Activity         (3)  │  ← Badge: recent operations
│                          │
├─────────────────────────┤
│  ⚙ Settings              │  ← Bottom-pinned
└─────────────────────────┘
```

4 items. No sections, no separators, no meta boxes, no "Help & Guide." Clean.

---

## 5. Layout Architecture

### Application Shell

```
┌──────────────────────────────────────────────────────────────┐
│ ● ● ●              MCP Gateway Manager              [theme] │  ← Custom titlebar, 38px
├────────────┬─────────────────────────────────────────────────┤
│            │  Page Title          [Preview Sync] [Apply]     │  ← Page header, 48px
│  Sidebar   ├─────────────────────────────────────────────────┤
│  220px     │                                                  │
│  (icons    │  Page Content (scrollable)                       │
│   at 52px) │                                                  │
│            │                                                  │
├────────────┼─────────────────────────────────────────────────┤
│            │  Claude ● | Cursor ● | Codex ●   Last sync: 2m │  ← Status bar, 28px
└────────────┴─────────────────────────────────────────────────┘
```

### Desktop-Native Requirements

```css
body {
  overflow: hidden;
  cursor: default;
  font-family: var(--font-sans);
  font-size: var(--text-base);
  color: var(--text-primary);
  background: var(--bg-base);
  -webkit-font-smoothing: antialiased;
  overscroll-behavior: none;
  user-select: none;
}

/* Restore selection only in content areas */
.selectable { user-select: text; }
input, textarea { cursor: text; }
a, button, [role="button"] { cursor: pointer; }

/* Titlebar drag region */
.titlebar-drag { -webkit-app-region: drag; }
.titlebar-no-drag { -webkit-app-region: no-drag; }

/* Scrollbar — thin, auto-hide */
::-webkit-scrollbar { width: 6px; height: 6px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb {
  background: var(--text-muted);
  border-radius: var(--radius-full);
}
```

### Window Behavior

- Minimum size: 800 x 500px
- Default size: 1100 x 720px
- Sidebar: 220px default, collapsible to 52px (icon-only) via `Cmd+B` / `Ctrl+B`
- Sidebar resize: not needed at this app's complexity — fixed 220px or collapsed
- Window state persistence: position, size, sidebar collapsed, active page, theme

---

## 6. Component Architecture — Breaking the Monolith

### File Structure

```
src/
  components/
    layout/
      AppShell.tsx          ← Root: titlebar + sidebar + content + statusbar
      TitleBar.tsx           ← Custom titlebar with drag region
      Sidebar.tsx            ← Navigation with 4 items
      StatusBar.tsx           ← Platform health indicators
    shared/
      Button.tsx             ← Primary, secondary, ghost, danger variants
      Badge.tsx              ← Count badge (replaces StatusPill)
      Card.tsx               ← Surface container
      DataTable.tsx          ← Sortable table with sticky header
      EmptyState.tsx         ← Zero-state with icon + message
      Input.tsx              ← Text input with label
      Select.tsx             ← Dropdown
      Toggle.tsx             ← Switch (replaces checkbox for booleans)
      Dialog.tsx             ← Modal dialog (replaces browser confirm)
      Toast.tsx              ← Non-blocking notification
      Tooltip.tsx            ← Hover hint
      Kbd.tsx                ← Keyboard shortcut display
    pages/
      ServersPage.tsx        ← Unified matrix + metrics header
      SyncPage.tsx           ← Assistant intake + preview + apply
      ActivityPage.tsx       ← Merged activity + revisions timeline
      SettingsPage.tsx       ← Config + about + theme
  hooks/
    useKeyboardShortcut.ts
    useWindowState.ts
    useTheme.ts
  lib/
    shortcuts.ts            ← Central shortcut registry
    platform.ts             ← OS detection (isMac, modKey, etc.)
    matrix.ts               ← (existing, keep)
    assistant.ts            ← (existing, keep)
    theme.ts                ← (existing, keep)
```

### AppShell Layout (the replacement for App.tsx's grid)

```tsx
// Simplified structure — AppShell.tsx
<div className="app-shell">
  <TitleBar />
  <div className="app-body">
    <Sidebar activePage={page} onNavigate={setPage} collapsed={collapsed} />
    <main className="main-panel">
      <PageHeader title={...} actions={...} />
      <div className="main-content">
        {page === "servers" && <ServersPage />}
        {page === "sync" && <SyncPage />}
        {page === "activity" && <ActivityPage />}
        {page === "settings" && <SettingsPage />}
      </div>
      <StatusBar platforms={...} />
    </main>
  </div>
</div>
```

---

## 7. Page Designs

### Servers Page (the primary view)

This is where users spend 80% of their time. It replaces Dashboard + Platform Matrix + MCP Registry.

```
┌─────────────────────────────────────────────────────────────┐
│  Servers                              [+ Add MCP] [Sync ▾]  │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐                     │
│  │ Claude   │  │ Cursor   │  │ Codex    │  ← Platform pills  │
│  │ 8 servers│  │ 6 servers│  │ 4 servers│    with health     │
│  │ ● Ready  │  │ ● Ready  │  │ ○ N/A    │                    │
│  └─────────┘  └─────────┘  └─────────┘                     │
│                                                              │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ Server        │ Claude │ Cursor │ Codex  │ Status     │  │
│  ├───────────────┼────────┼────────┼────────┼────────────┤  │
│  │ tavily        │   ✓    │   ✓    │   ✓    │ Shared     │  │
│  │ filesystem    │   ✓    │   ✓    │   —    │ Shared     │  │
│  │ github        │   ✓    │   —    │   —    │ Claude only│  │
│  │ playwright    │   ✓    │   ✓    │   —    │ Shared     │  │
│  └───────────────┴────────┴────────┴────────┴────────────┘  │
│                                                              │
│  ✓ = enabled  ○ = disabled  — = not configured               │
└─────────────────────────────────────────────────────────────┘
```

**Key changes from current:**
- Platform cards are compact status pills at the top, not full cards
- The matrix IS the registry — no separate "MCP Registry" page
- Server names use monospace font
- Checkmarks replace checkboxes for cleaner scanning (checkboxes appear on hover for toggling)
- Right-click server row → context menu: Edit, Share to all platforms, Remove from [platform], Delete
- Click server row → inline detail panel slides in from right (inspector pattern)
- Status column replaces the "Shared/Custom" mode pill with plain text

### Sync Page

```
┌─────────────────────────────────────────────────────────────┐
│  Sync                                                        │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌── Add MCP ─────────────────────────────────────────────┐ │
│  │  Paste a URL, npm package name, or GitHub repo          │ │
│  │  ┌─────────────────────────────────────────┐ [Analyze]  │ │
│  │  │ https://...                              │            │ │
│  │  └─────────────────────────────────────────┘            │ │
│  │                                                          │ │
│  │  (Analysis results appear inline below after Analyze)    │ │
│  └──────────────────────────────────────────────────────────┘│
│                                                              │
│  ┌── Pending Changes ─────────────────────────────────────┐ │
│  │  3 operations across 2 platforms                        │ │
│  │                                                          │ │
│  │  Claude:  +1 add, ~1 update                              │ │
│  │  Cursor:  +1 add                                         │ │
│  │  Codex:   no changes                                     │ │
│  │                                                          │ │
│  │  [Preview Diff]              [Apply Sync]                │ │
│  └──────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
```

**Key changes:** Assistant and sync operations merged into one action-oriented page. Less sprawl, clearer workflow: input → analyze → preview → apply.

### Activity Page

Single timeline merging activity log and revision history:

```
┌─────────────────────────────────────────────────────────────┐
│  Activity                    [Filter ▾]  [Export]            │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Today                                                       │
│  ─────                                                       │
│  14:32  Sync applied — 3 ops across Claude, Cursor  [Revert]│
│  14:30  Preview generated — 3 pending operations             │
│  14:28  Assistant analyzed: tavily-mcp (npm)                 │
│                                                              │
│  Yesterday                                                   │
│  ─────────                                                   │
│  09:15  Settings updated — Codex config path changed         │
│  09:10  Manual backup created for Claude                     │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

**Key changes:** No separate "Revisions" page. Revisions are entries in the activity timeline with a [Revert] action button. Activity types shown as plain text, not a separate table column.

### Settings Page

Compact, sectioned, no cards — just grouped controls:

```
┌─────────────────────────────────────────────────────────────┐
│  Settings                                                    │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Appearance                                                  │
│  Theme:  [Light] [Dark] [System]     ← Segmented control    │
│                                                              │
│  ── Platform Config Paths ──                                 │
│  Claude   ~/Library/.../claude_desktop_config.json  [Change] │
│           + Add additional path                              │
│  Cursor   ~/.cursor/mcp.json                        [Change] │
│  Codex    ~/.codex/mcp.json                         [Change] │
│                                                              │
│  ── Assistant Backend ──                                     │
│  Provider:  [Codex Internal ▾]                               │
│  API Key:   ••••••••••••••••                        [Reveal] │
│  Model:     gpt-5-codex                                      │
│  Strict:    [toggle off]                                     │
│                                                              │
│  ── Backups ──                                               │
│  Prompt before apply:  [toggle on]                           │
│                                                              │
│  ── About ──                                                 │
│  MCP Gateway Manager v1.0.0                                  │
│  MIT License · GitHub · Documentation                        │
└─────────────────────────────────────────────────────────────┘
```

**Key changes:** Help page eliminated — a link to docs is enough. Settings are grouped with subtle section dividers, not cards. Toggle switches replace checkboxes for booleans.

---

## 8. Keyboard Shortcuts

| Action | macOS | Windows |
|--------|-------|---------|
| Go to Servers | `Cmd+1` | `Ctrl+1` |
| Go to Sync | `Cmd+2` | `Ctrl+2` |
| Go to Activity | `Cmd+3` | `Ctrl+3` |
| Go to Settings | `Cmd+,` | `Ctrl+,` |
| Toggle sidebar | `Cmd+B` | `Ctrl+B` |
| Preview sync | `Cmd+Shift+P` | `Ctrl+Shift+P` |
| Apply sync | `Cmd+Shift+A` | `Ctrl+Shift+A` |
| Add MCP | `Cmd+N` | `Ctrl+N` |
| Search servers | `Cmd+K` | `Ctrl+K` |
| Refresh state | `Cmd+R` | `Ctrl+R` |

Register in `src/lib/shortcuts.ts`. Show hints in tooltips on all action buttons.

---

## 9. Context Menus

### Server Row (right-click)

```
Edit Configuration...
──────────────────
Enable for Claude
Enable for Cursor
Enable for Codex
Share to All Platforms
──────────────────
Remove from Claude
Remove from Cursor
Delete Server              ← red text
```

### Activity Entry (right-click)

```
Copy Details
Revert This Revision       ← only for sync-apply entries
```

Build with Radix UI `ContextMenu`. Never use browser-native right-click menu.

---

## 10. Status Bar

The bottom 28px strip — always visible:

```
Claude ● Ready  |  Cursor ● Ready  |  Codex ○ Not Found  |  Last sync: 2 min ago
```

- Green dot `●` = config found and valid
- Yellow dot `●` = config found but has warnings
- Gray dot `○` = config not found
- Platform names are clickable → reveal path in Finder/Explorer

---

## 11. What to Delete

| Current | Action |
|---------|--------|
| Radial gradient on body | Delete. Use flat `--bg-base`. |
| Sora font import | Delete. Use Inter only. |
| `--radius-lg: 18px` | Replace with `8px`. |
| `--bg-sidebar` green tint (`color-mix(...accent 12%)`) | Replace with flat `--bg-sidebar`. |
| Dashboard page | Merge into Servers page as header metrics. |
| MCP Registry page | Merge into Servers page as the table. |
| Revisions page | Merge into Activity page as timeline entries. |
| Help & Guide page | Delete. Add docs link in Settings. |
| `sidebar-meta` boxes | Delete. Version goes next to logo. Health goes to status bar. |
| `dashboard-hero` card | Delete. No hero cards in enterprise tools. |
| `metric-card` with 1.95rem values | Replace with compact inline metrics in Servers page header. |
| All `color-mix()` usage for backgrounds | Replace with flat CSS custom property values. |

---

## 12. Migration Path

### Phase 1: Design Tokens + Shell
1. Replace `tokens.css` with the new color/type/spacing system above
2. Replace `app.css` body styles (kill gradient, set overflow:hidden, cursor:default)
3. Build `AppShell.tsx`, `TitleBar.tsx`, `Sidebar.tsx`, `StatusBar.tsx`
4. Wire sidebar to 4 pages instead of 8

### Phase 2: Extract Pages
5. Extract `ServersPage.tsx` from App.tsx (Dashboard + Matrix + Registry sections)
6. Extract `SyncPage.tsx` (Assistant + sync preview/apply)
7. Extract `ActivityPage.tsx` (Activity + Revisions)
8. Extract `SettingsPage.tsx` (Settings + Theme)
9. Delete monolithic App.tsx render logic, keep only routing shell

### Phase 3: Shared Components
10. Build `Button`, `Input`, `Toggle`, `Badge`, `DataTable`, `Dialog`, `Toast`
11. Replace all raw `<button className="action-button">` with `<Button>`
12. Replace all raw `<input className="text-input">` with `<Input>`
13. Replace checkbox booleans with `<Toggle>`

### Phase 4: Desktop Polish
14. Add keyboard shortcuts (`useKeyboardShortcut` hook + `shortcuts.ts`)
15. Add context menus (Radix ContextMenu on server rows, activity entries)
16. Add window state persistence (`useWindowState` hook)
17. Add sidebar collapse animation (width transition 200ms)
18. Wire status bar to live platform health data

---

## Summary of Changes

| Dimension | Before | After |
|-----------|--------|-------|
| Pages | 8 | 4 |
| Accent | Teal `#0f766e` | Blue `#2563eb` |
| Body bg | Radial gradient | Flat `#f7f8fa` |
| Radius | 18px | 8px max |
| Font | Sora + IBM Plex Sans | Inter only |
| Base size | ~16px web default | 13px |
| Sidebar | 248px, no collapse | 220px, collapsible to 52px |
| App.tsx | 2034 lines, monolith | ~50 lines, routing shell |
| Keyboard | None | 10+ shortcuts |
| Context menus | None | On all interactive rows |
| Status bar | None | Platform health strip |
| Window chrome | Basic | Custom titlebar with drag region |
