# AGENTS.md — OMPChamber AI System Instructions & Protocols

## Overview
**OMPChamber** serves as the developer web view console and diagnostic chamber for **AI Oh-My-Pi** (`oh-my-pi`), integrated with **remisJS** and **bun** runtime environments.

---

## Architecture & Agent Roles

### The Oh-My-Pi Autonomous Agent (`oh-my-pi`)
- **Primary Function**: Autonomous CI/CD pipeline monitoring, build log analysis, dependency resolution, and edge deployment verification.
- **Runtime Target**: Bun v1.2.4 with native ESM and TypeScript striping.
- **Framework Integration**: remisJS edge routes & build plugins.

### OMPChamber Web View Interface
- **Session Sidebar** (left, default 268px): workspace folders bound to oh-my-pi projects, each listing its sessions, plus search/sort/archive toolbar and the settings/about/new-workspace/scheduler modals (`app/components/layout/session-sidebar/`).
- **Top Navbar**: active session title plus view controls — switch to mobile view, toggle the editor panel, and toggle the right panel (`app/components/layout/desktop-layout/TopNavbar.tsx`).
- **Chat Timeline** (center): the streaming agent conversation — thinking accordions, tool-call cards, queue panel, and the composer (`app/components/workspace/chat-timeline/`).
- **Editor Panel**: opened-file tabs and code editing (`app/components/workspace/editor/`).
- **Right Panel + Activity Bar**: switchable developer panels — `context` (Context & Telemetry), `files`, `search`, `git` (Source Control), `terminal` (Bun), and `browser` (`app/components/workspace/`, `app/components/layout/RightActivityBar.tsx`).

### Agent Event Stream Transport
- The live omp agent bridge (`POST /api/agent/:sessionId` for commands) streams events over **WebSocket by default** — `GET /api/agent/:sessionId/ws` — with **SSE** (`/api/agent/:sessionId/events`) as the fallback, selected in **Settings → Chats → Streaming Transport** (`streamTransport` in `omp_chamber_settings`; default `websocket`).
- Server side is shared by dev and prod: `server/agent-stream-websocket.js` attaches to whatever `http.Server` owns the port — the Vite dev server (plugin in `vite.config.ts`) and the production entry `server/index.js` (started by `npm start` and `ompchamber serve --prod`).
- Client side: `app/lib/chat/omp/{transport,socket,sse}.ts` own the connections; both hand every frame to `app/lib/chat/omp/agent-events.ts`, which folds it into chamber state. Keep frame handling in that folder — never fork behavior per transport.

---

## Agent Operational Workflows

### Diagnostic Protocol on Build Failures
1. **Log Scrape**: Scrape build output from bun runner (matching `exit 1` conditions).
2. **Error Isolation**: Target the root failure point (e.g., missing package imports, type mismatch, or invalid asset clipping).
3. **Patch Generation**: Formulate a runnable bun terminal command (e.g., `bun add @superdesign/svg-geometry@latest && bun run build`).
4. **Execution in Chamber**: The user or agent triggers execution directly in the right sidebar chamber panel.

### Code Style & Persistence Guidelines
- Use the CSS variable system defined in `app/tailwind.css` (`var(--theme-ink)`, `var(--theme-paper)`, etc.) and standard Tailwind classes mapped to them (`bg-paper`, `text-ink`, `border-ink/20`).
- The application supports multiple themes (e.g., E-Ink Paper Monochrome, One Dark Pro Soft). **DO NOT** hardcode raw hex colors like `#141310` or `#faf8f3` in component files.
- Semantic states are expressed purely through these theme variables.
- The only allowable chroma (outside of dark theme) is the signal red variable `var(--theme-error)` (`text-error`, `bg-error`) reserved for failures and error messages.

---

## Codebase Architecture & File Organization Rules

### 1. File Size Ceiling (Hard Limit: 350 Lines)
- **Maximum 350 Lines Per File**: Every TypeScript and TSX file must strictly stay under 350 lines of code (`wc -l` result `< 350`).
- **Decompose before you hit the limit**: When a file approaches the ceiling, split it immediately — never let it cross 350 and never "temporarily" exceed it.
- **Extraction patterns** (pick the one that matches the code):
  - Large render blocks ➔ sub-components in the parent's kebab-case folder (`git-panel/TreeView.tsx`).
  - Stateful logic clusters ➔ custom hooks under `app/hooks/<domain>/`.
  - Pure functions / constants / validators ➔ `app/lib/<domain>/` modules.
  - Large callback objects / factories ➔ factory functions taking a single `deps` record (preserves closure semantics exactly).
  - Shared low-level utilities ➔ a sibling `shared/` or `utils.ts` inside the feature folder.
- **Verify**: `find app -name "*.ts" -o -name "*.tsx" | xargs wc -l | grep -v total | awk '$1>350'` must print nothing.

### 2. Folder & Filename Conventions (Clean Names)
- **Symmetrical folders**: A component's folder mirrors its name in **kebab-case**, and the folder's main entry is `index.tsx`:
  - `ChatTimeline` ➔ `app/components/workspace/chat-timeline/index.tsx`
  - `GitPanel` ➔ `app/components/workspace/git-panel/index.tsx`
  - `SessionSidebar` ➔ `app/components/layout/session-sidebar/index.tsx`
  - `ModelDropdown` ➔ `app/components/workspace/model-dropdown/index.tsx`
- **Suffix-only filenames**: When the folder already supplies the context, child files DROP the redundant prefix and keep only the suffix:
  - `app/components/workspace/model-dropdown/Header.tsx` — not `ModelDropdownHeader.tsx`
  - `app/components/workspace/git-panel/TreeView.tsx` — not `GitTreeView.tsx`
  - `app/components/workspace/chat-timeline/tool-renderers/panels/Bash.tsx` — not `BashPanel.tsx`
  - `app/hooks/chat/timeline/actions.ts` — not `useChatTimelineActions.ts`
  - `app/lib/omp/rpc/manager.ts` — not `rpc-manager.ts`
- **No duplicate basenames in the same folder**: if two files would collide, move one to its correct domain folder or give it a distinguishing suffix (e.g. `panels/SearchTool.tsx` vs `panels/SearchFs.tsx`).
- **`index` is reserved for the folder's real entry point** (the main component/hook implementation) — never a re-export barrel (see rule 3).
- **Naming case**: kebab-case for folders and multi-word non-component files (`active-project.ts`, `notification-sound.ts`); PascalCase for React component files; `useXxx` prefix only when the file is a standalone reusable hook at a domain root.
- Reusable or cross-cutting components belong in `app/components/common/`.
- No empty, abandoned, or ghost folders (`app/applet/`, duplicate `routes/api+`, etc.).

### 3. Direct, Explicit Imports (No Barrel Clutter)
- Do NOT create re-export-only `index.ts` barrels inside `app/components/`, `app/hooks/`, or `app/lib/` — they pollute editor fuzzy-search and hide file origins.
- `index.tsx`/`index.ts` is allowed ONLY when it contains the folder's actual implementation (the main component/hook), not a list of `export ... from` statements.
- Import the concrete module explicitly via the `@/` alias:
  - `import { ChatTimeline } from '@/components/workspace/chat-timeline';` (folder entry)
  - `import { Header } from '@/components/workspace/model-dropdown/Header';`
  - `import { useChatTimeline } from '@/hooks/chat/timeline';`
  - `import { normalizeNoticePositions } from '@/lib/chat/order';`
- The only intentional barrel is `app/types/index.ts` (the central type barrel).

### 4. Absolute Imports via `@/` Alias (No Relative Imports)
- **All** internal imports MUST use the `@/` path alias (mapped to `./app/*` in both `tsconfig.json` and `vite.config.ts`). Relative imports (`./`, `../`) are **forbidden** in application code.
- This applies to every import form: `import`, `import type`, `export ... from`, and side-effect imports.
- Examples:
  - `import { ChatTimeline } from '@/components/workspace/chat-timeline';`
  - `import type { OmpSession } from '@/types/omp/session';`
  - `import { getDb } from '@/db.server';`
  - `import '@/tailwind.css';`
- Exceptions (keep relative):
  - Third-party packages and node built-ins (never prefixed with `@/`).
  - Assets outside `app/` (e.g., `package.json` at the project root) — use `@/../package.json` or a relative path.
- The `~` alias is deprecated; use `@/` exclusively.
- **Verify**: `grep -rnE "from '\.\.?/" app --include='*.ts' --include='*.tsx' | grep -v node_modules` must print nothing.

### 5. Domain Grouping for hooks / lib / data / types
- Non-UI modules MUST be grouped into domain subfolders — never dumped flat in the root of `app/hooks/`, `app/lib/`, `app/data/`, or `app/types/`.
- **`app/hooks/<domain>/`**: `chat/`, `ui/`, `workspace/`. Split further when a family grows: `chat/timeline/` (timeline state + actions), `chat/omp/` (live agent bridge).
- **`app/lib/<domain>/`**: `chat/`, `code/`, `fs/`, `markdown/`, `models/`, `omp/`, `workspace/`. `omp/` splits into `core/`, `rpc/`, `session/`, `config/`.
- **`app/data/<domain>/`**: `settings/`, `samples/`, `mock/`, `models/`, `theme/`, `agent-data/`, `context-data/`.
- **`app/types/<domain>/`**: group related interfaces (`settings/`, `omp/`); truly cross-cutting types stay at the root.
- Grouping changes are atomic: move the files AND update every importer in the same change.

### 6. Pure UI Components & Semantic Separation
- **`app/components/` is for React UI (`.tsx`)**. Co-located pure helpers are allowed when scoped to that feature, but must be `.ts` and live under the feature folder or its `shared/` (e.g. `tool-renderers/shared/detect-format.ts`, `editor/utils.ts`).
- Anything reusable beyond a single feature belongs in `app/lib/`, never in a component folder.
- **Dedicated non-UI directories**:
  - **Hooks (`app/hooks/<domain>/`)**: Custom React hooks.
  - **Data (`app/data/<domain>/`)**: Mock or static datasets.
  - **Types (`app/types/<domain>/`)**: Domain interfaces and types.

### 7. Domain Types Architecture
- Domain data models and shared TypeScript interfaces must be organized cleanly under `app/types/`:
  - `workspace.ts` — folders, session entities, and sorting types
  - `fs.ts` — file explorer node trees, opened files, and search result items
  - `git.ts` — git changes, branch lists, and view mode states
  - `chat.ts` — messages, agent actions, monologue, and attachments
  - `settings/` — settings state and per-category settings shapes (`agent.ts`, `command.ts`, `mcp.ts`, `project.ts`, `provider.ts`, `skill.ts`, `state.ts`)
  - `omp/` — oh-my-pi bridge types (`session.ts`, `agent.ts`)
  - `index.ts` — central export barrel for all types (`import type { ... } from '@/types'`)

### 8. Verification Requirements
- Every change must pass:
  1. `npm run lint` (`tsc --noEmit`) without errors.
  2. `npx tsc --noEmit --noUnusedLocals --noUnusedParameters` without errors.
  3. Production build verification (`npm run build`).
- **Unused Code Check (MANDATORY before task completion)**: Before declaring any task done, verify no unused imports, locals, or dead props were introduced or left behind:
  - Fix every `TS6133` (declared but never read), `TS6192` (all imports unused), `TS6196` (declared but never used), and `TS6198` (all destructured elements unused) error.
  - Remove unused imports (icons, types, components) and unused destructured props/state — do not leave dead code behind.
  - If a component's props/state become unused because a feature was stubbed or removed, strip them from the interface, the destructure, and every call-site in the same change.
  - Do NOT ship `import React from 'react'` in `.tsx` files — the React 19 JSX transform makes it unnecessary (keep named imports like `useState`).
- **Structural Checks (MANDATORY for refactors that move/rename files)**:
  - No file exceeds 350 lines (rule 1 command).
  - No relative imports remain (rule 4 command).
  - No duplicate basenames inside the same folder.
  - Every moved/renamed file's importers are updated in the same change; grep for the old path returns nothing.

### 9. Layout & Panel Resizing
- **Panel Width**: Be aware that the width of the layout panels (like the sidebar or right sidebar) is considered and calculated in **pixels**. When handling layout persistence or default sizes, ensure they are treated as pixel values rather than just percentages, adapting library APIs (like `react-resizable-panels`) as needed to accommodate pixel-based design intent.
- **One remembered width PER PANEL, never per group**: the sidebar, the chat column, the editor panel (a separate width for source tabs and for diff tabs), and each of the eight right-panel views (`files`, `search`, `git`, `terminal`, `context`, `user-browser`, `browser`, `usage`) each own their width. The map and its slots live in `app/lib/workspace/panel-widths.ts` (data) and `app/hooks/workspace/panel-widths.ts` (state + `desktopLayoutSizes` persistence); per-view defaults, minimums, and the view list live in `app/lib/workspace/right-panels.ts`. Sharing one number between panels — or resetting a panel to a hard-coded width when it is toggled or switched — is exactly the bug this shape exists to prevent.
- **Restore through the group, not the panel**: `react-resizable-panels` caches one layout per panel composition, so a returning panel would replay stale sizes. `WorkspacePanels` rebuilds the inner group's layout from the remembered pixel widths with a single `setLayout` (fixed panels take their width back, the chat column absorbs the remainder); append an entry here if a new resizable group is introduced.

### 10. Route Organization & Domain Grouping
- **Domain-Based Subdirectories**: Routes under `app/routes/` MUST be organized and grouped into subdirectories matching their functional domain (e.g., `app/routes/api/settings/`, `app/routes/api/chat/`, `app/routes/api/fs/`, `app/routes/api/terminal/`, `app/routes/api/telemetry/`, `app/routes/api/sessions/`, `app/routes/api/files/`, `app/routes/api/folders/`).
- **No Monolithic Flat Folder Clutter**: Do NOT dump all API route endpoints loosely in the root of `app/routes/api/` as flat files. Group related child endpoints inside domain folders (e.g., `settings/route.ts`, `settings/agents.ts`, `settings/providers.ts`).
- **Nested & Parametric Routes**: Parametric and dynamic routes follow Remix flat-routes directory nesting conventions (e.g., `chat/$sessionId.ts`, `sessions/$sessionId.queue.ts`).

### 11. Environment Data Modes (`MOCK=true` vs `MOCK=false`)
- **`MOCK=true` (Simulation & Demo Mode)**:
  - All features and loaders utilize rich predefined datasets and presets from `app/data/` (simulated demo chats, token telemetry ranges, agent/project presets).
  - Database seeding automatically injects sample workspace folders, demo commit sessions, and file structures.
- **`MOCK=false` (Real Data Mode)**:
  - The application operates strictly against real backend resources and real SQLite database persistence.
  - No synthetic sample sessions, fake dialogues, or hardcoded mock files are auto-injected.
  - Managed globally through `process.env.MOCK` and verified via `@/mock.server`.

