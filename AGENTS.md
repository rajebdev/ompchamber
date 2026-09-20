# AGENTS.md — OMPChamber AI System Instructions & Protocols

## Overview
**OMPChamber** serves as the developer web view console and diagnostic chamber for **AI Oh-My-Pi** (`oh-my-pi`), integrated with **remisJS** and **bun** runtime environments.

---

## Runtime: Bun Only

**This application runs exclusively on Bun. Do not introduce Node-only APIs, and do not assume `node <entry>` works.**

- **Server** (`src/server/**`) imports `bun:sqlite` and resolves the `@/` path alias — Node fails on both with `ERR_MODULE_NOT_FOUND`. Run it with `bun run src/server/index.ts` (dev, watched) or `NODE_ENV=production bun run src/server/index.ts` (prod). `bun run start` and `ompchamber serve --prod` both do the latter.
- **Tests** run under `bun test`; do not add a Node test runner.
- **CLI** (`src/cli/**`) is Bun too: `#!/usr/bin/env bun` shebang and `@/cli/...` imports, so it needs Bun on `PATH`. It resolves the Bun binary via `resolveBunBin()` and spawns the server with it. **`rsbuild` is the only piece that still runs under Node** — it is a build tool and never ships.
- **Practical rules:** never swap `bun:sqlite` for a Node driver; never add a `node:` import to `src/client/**` or `src/shared/lib/**`; keep `.ts`/`.tsx` execution in Bun's hands (no `tsx`/`ts-node`).

### Bun-Native APIs vs `node:*` Imports

Bun implements `node:*` builtins natively — they do **not** shell out to a Node binary. Verified: `node:child_process` runs with `node` off `PATH` and `process.execPath` stays `bun`. So a `node:` import is not a correctness bug; it is only a preference when Bun ships a first-class equivalent. **Do not "convert" a `node:` import to a `Bun.*` call when no equivalent exists** — the conversion is either impossible or silently changes behavior.

| Prefer | Instead of | Why |
|---|---|---|
| `Bun.env.X` | `process.env.X` | Same object in Bun (`Bun.env === process.env`), but the Bun name states the runtime. **Server/CLI only** — `Bun.env` does not exist in the browser, so `src/client/**` and `src/shared/**` must never use it. |
| `crypto.randomUUID()` (global) | `import { randomUUID } from 'crypto'` | Global is available; no import needed. |
| `Bun.gzipSync` / `Bun.gunzipSync` | `zlib.gzipSync` / `gunzipSync` | Byte-identical output, verified. |
| `Bun.YAML.parse` / `Bun.YAML.stringify(obj, null, 2)` | `yaml` package | Rust parser, zero-dependency. The third `stringify` argument (space) produces block-style multi-line YAML; without it output is flow-style single-line. **Caveat**: round-trip drops comments — files that must preserve user comments still need a document-model parser (the `yaml` package was removed because no remaining call site needs comment preservation). |
| `Bun.which('bin')` | `which` via `spawnSync` | Direct PATH lookup. |
| `Bun.spawnSync` / `Bun.spawn` | `child_process.exec`/`execFile`/`spawn` | Native `timeout`, `maxBuffer`, `windowsHide`, `detached` (process group), and `signal: AbortSignal` options. Unlike promisified exec, non-zero exits do **not** throw — check `exitCode`; timeout/kill detection uses `signalCode` (Bun sets `killed: true` even for normal non-zero exits). Server-wide: `lib/fs/shell.ts` wraps `sh -c` for shell strings; `lib/omp/rpc/lines.ts` reads NDJSON from Bun `ReadableStream` stdout (replaces `readline`). |
| `Bun.file(p).stream()` | `fs.createReadStream` | Returns a real Web `ReadableStream` for `new Response(...)` — no node-stream adapter or type cast. |
| `Bun.Glob.scanSync({ cwd, onlyFiles: true })` | `readdirSync` + regex filter loops | Rust-native globbing; supports `*.{a,b,c}` alternation. Returns relative paths; size guards still need `statSync`. |
| `await Bun.file(p).text()` / `.json()` | `fs.readFileSync(p, 'utf8')` / `fs.promises.readFile` | Only where the call site is already `async`. `Bun.file()` is async; do not force a sync caller to become async just to use it. Also: `.slice(a, b).text()` for partial reads (log follow), `.stat()`, `.exists()`. |
| `await Bun.write(p, data)` | `fs.writeFileSync` / `fs.promises.writeFile` | **`Bun.write` ignores `mode` when *creating* a new file (verified on Bun 1.4.0 and 1.4.2 despite the docs signature)** — it cannot create a `0o600` file; it is honored when overwriting an existing file. Keep `fs.writeFileSync(..., { mode: 0o600 })` for the CLI registry (`src/cli/lib/runtime.js`). |

**These stay `node:*` — Bun has no equivalent, so do not attempt a conversion:**

- **`node:path`** — `Bun.path` is `undefined`. No replacement exists. (The CLI uses its own minimal `src/cli/lib/path-utils.js` for join/resolve/dirname/home instead of importing `node:path`.)
- **`node:fs` directory + metadata ops** — `mkdir`/`readdir`/`stat`/`exists`/`rm`/`rename`/`Dirent`. Bun's own docs point at `node:fs` for directories; `Bun.file()` is for file contents (`stat()`/`exists()` are async BunFile methods where the chain is already async). `Bun.Glob.scanSync` covers readdir+filter scans.
- **`node:fs` sync reads in sync functions** — `Bun.file()` is async; the omp session/config layers are now fully async (2026-09), so sync reads survive only in genuinely sync contexts (module-level path setup, lockfile exclusive-create in `config/mcp.ts`, and the title-slot in-place 256-byte `r+` write where an offset write is required — Bun's FileSink cannot seek). Convert a read only when the enclosing call chain is already async; CLI bootstrap stays sync deliberately: sequential dependencies (mkdir → open fd → spawn → write registry), no concurrency to exploit, and signal-handler paths must not depend on pending promises.
- **`node:os`** — `Bun.os` is `undefined`. **Never replace `os.homedir()`/`os.tmpdir()` with `Bun.env.HOME`/`TMPDIR`/`TEMP` anywhere** — the env vars are absent when a process runs without a shell (cron, launchd, systemd, GUI launcher), and they yield `undefined`, not a fallback: `path.join(undefined, x)` throws, and in the CLI it produced `''` so `~/.ompchamber` silently became the cwd-relative `.ompchamber` (split-brain: `ompchamber stop`/`status` looked in the wrong directory and could not find a live server). `os.homedir()` falls back to `getpwuid()` on POSIX and `USERPROFILE` on Windows; `os.tmpdir()` walks `TMPDIR` → `TMP` → `TEMP` then `/tmp` (and strips macOS's trailing slash). This applies to `src/cli/**` too — `src/cli/lib/path-utils.js` uses `os.homedir()` for exactly this reason. Signal numbers use the local table in `src/cli/lib/process-lifecycle.js` instead of `os.constants.signals`.
- **`node:readline`** — no Bun equivalent for generic streams; `src/server/lib/omp/rpc/lines.ts` is the in-repo NDJSON reader for Bun spawn stdout.
- **`node:zlib` brotli** — `Bun.brotliCompressSync` is `undefined`; Bun ships gzip only (`src/server/plugins/compress.ts` keeps brotli here).
- **`node:child_process`** — fully migrated (2026-09): every `exec`/`execFile`/`spawn` call site now uses `Bun.spawn`/`Bun.spawnSync`, and `readline` usage is gone. Do not reintroduce `child_process`; new code goes through `Bun.spawn` (or `lib/fs/shell.ts` for shell strings).

### Toolchain Commands: Bun Only (no npm, npx, yarn, pnpm)

**`bun.lock` is the only lockfile.** `npm`, `npx`, `yarn`, and `pnpm` are never used in this repo — not to install, not to run scripts, not to execute a binary. Every tool that would otherwise be reached through `npx` is reached through **`bunx`**, which resolves the same local `node_modules/.bin` binary.

| Never | Always |
|---|---|
| `npm install` / `npm i <pkg>` / `npm uninstall <pkg>` | `bun install` / `bun add <pkg>` / `bun remove <pkg>` (add `-d` for dev deps) |
| `npm run <script>` | `bun run <script>` (or bare `bun <script>` when it is unambiguous) |
| `npx <bin>` / `npx -y <pkg>` | `bunx <bin>` — e.g. `bunx tsc --noEmit`, `bunx rsbuild build` |
| `node <entry>` / `tsx` / `ts-node` | `bun run <entry.ts>` — Bun executes TypeScript directly |
| `npx jest` / `npx vitest` / `npx mocha` | `bun test` |

- **Never commit** `package-lock.json`, `yarn.lock`, or `pnpm-lock.yaml`; if one appears, delete it and re-run `bun install`.
- `bunx` is preferred over `./node_modules/.bin/...` for readability; both hit the identical local binary.

---

## Architecture & Agent Roles

### The Oh-My-Pi Autonomous Agent (`oh-my-pi`)
- **Primary Function**: Autonomous CI/CD pipeline monitoring, build log analysis, dependency resolution, and edge deployment verification.
- **Runtime Target**: Bun 1.4.x with native ESM and TypeScript striping.
- **Framework Integration**: Elysia edge routes & Rsbuild plugins.

### OMPChamber Web View Interface
- **Session Sidebar** (left, default 268px): workspace folders bound to oh-my-pi projects, each listing its sessions, plus search/sort/archive toolbar and the settings/about/new-workspace/scheduler modals (`src/client/components/layout/session-sidebar/`).
- **Top Navbar**: active session title plus view controls — switch to mobile view, toggle the editor panel, and toggle the right panel (`src/client/components/layout/desktop-layout/TopNavbar.tsx`).
- **Chat Timeline** (center): the streaming agent conversation — thinking accordions, tool-call cards, queue panel, and the composer (`src/client/components/workspace/chat-timeline/`).
- **Editor Panel**: opened-file tabs and code editing (`src/client/components/workspace/editor/`).
- **Right Panel + Activity Bar**: switchable developer panels — `context` (Context & Telemetry), `files`, `search`, `git` (Source Control), `terminal` (Bun), and `browser` (`src/client/components/workspace/`, `src/client/components/layout/RightActivityBar.tsx`).

### Agent Event Stream Transport
- The live omp agent bridge (`POST /api/agent/:sessionId` for commands) streams events over **WebSocket by default** — `GET /api/agent/:sessionId/ws` — with **SSE** (`/api/agent/:sessionId/events`) as the fallback, selected in **Settings → Chats → Streaming Transport** (`streamTransport` in `omp_chamber_settings`; default `websocket`).
- Server side is one Elysia app for dev and prod: `src/server/index.ts` owns the port and mounts `src/server/routes/`, so the agent WebSocket (`src/server/routes/agent/ws.ts`) is a first-class `.ws()` route on that same listener. Started by `bun run dev` (watched) and `bun run start` / `ompchamber serve --prod`.
- Client side: `src/shared/lib/chat/omp/{transport,socket,sse}.ts` own the connections; both hand every frame to `src/shared/lib/chat/omp/agent-events.ts`, which folds it into chamber state. Keep frame handling in that folder — never fork behavior per transport.

### Build & Dev Loop
- **`bun run build`** produces `dist/client` (the only build artifact). There is **no `dist/server`**: Bun executes `src/server/index.ts` as TypeScript directly, so the server is never bundled. `bun run start` and `ompchamber serve --prod` both run that same entry with `NODE_ENV=production`.
- **`bun run dev`** watches the server. The HTML shell is read from `dist/client/index.html`, so run **`bun run dev:client`** (`rsbuild build --watch`) alongside it for a rebuild-on-change loop. There is no HMR/prefresh: the server reloads on save and the client bundle rebuilds; refresh the page to pick it up.
- If `dist/client` is missing the server answers **503** with the exact command to run — not a bare 500.

### Route Method Contract
- Route modules keep the ported Remix shape: an exported `loader` (GET) and/or `action` (mutating verbs). **`action` owns method dispatch** — it branches on `request.method` and returns its own `405 { error: 'Method not allowed' }`.
- Because of that, `bindingsFor`/`actionBindings` mount `action` on **all four** mutating verbs, and add a 405 GET fallback when the path has no `loader`. Registering only the "supported" verb would turn a wrong-verb call into a 404 and hide the real problem.
- **One parameter name per path position.** Elysia's router rejects `/api/files/:sessionId` and `/api/files/:fileId/toggle` in the same tree. When two routes share a segment position, unify the name (the handlers map it to their own local variable). Current shared names: `sessions/:sessionId` (also carries a folder id for `GET /api/sessions/:sessionId`), `files/:fileId`.

---

## Agent Operational Workflows

### Diagnostic Protocol on Build Failures
1. **Log Scrape**: Scrape build output from bun runner (matching `exit 1` conditions).
2. **Error Isolation**: Target the root failure point (e.g., missing package imports, type mismatch, or invalid asset clipping).
3. **Patch Generation**: Formulate a runnable bun terminal command (e.g., `bun add @superdesign/svg-geometry@latest && bun run build`).
4. **Execution in Chamber**: The user or agent triggers execution directly in the right sidebar chamber panel.

### Code Style & Persistence Guidelines
- Use the CSS variable system defined in `src/client/tailwind.css` (`var(--theme-ink)`, `var(--theme-paper)`, etc.) and standard Tailwind classes mapped to them (`bg-paper`, `text-ink`, `border-ink/20`).
- The application supports multiple themes (e.g., E-Ink Paper Monochrome, One Dark Pro Soft). **DO NOT** hardcode raw hex colors like `#141310` or `#faf8f3` in component files.
- Semantic states are expressed purely through these theme variables.
- The only allowable chroma (outside of dark theme) is the signal red variable `var(--theme-error)` (`text-error`, `bg-error`) reserved for failures and error messages. Syntax highlighting is an explicit, user-approved exception: it is provided by Shiki with the dual-theme pair `one-light` (light themes) + `one-dark-pro` (dark themes). Token colors arrive as `--shiki-light` / `--shiki-dark` CSS variables on `.shiki` spans — consume them in `src/client/tailwind.css` under `[data-theme]`, never hardcode token hex, and never reintroduce `--syntax-*` variables or `.token.*` classes.

---

## Codebase Architecture & File Organization Rules

### 1. File Size Ceiling (Hard Limit: 350 Lines)
- **Maximum 350 Lines Per File**: Every TypeScript and TSX file must strictly stay under 350 lines of code (`wc -l` result `< 350`).
- **Decompose before you hit the limit**: When a file approaches the ceiling, split it immediately — never let it cross 350 and never "temporarily" exceed it.
- **Extraction patterns** (pick the one that matches the code):
  - Large render blocks ➔ sub-components in the parent's kebab-case folder (`git-panel/TreeView.tsx`).
  - Stateful logic clusters ➔ custom hooks under `src/client/hooks/<domain>/`.
  - Pure functions / constants / validators ➔ `src/shared/lib/<domain>/` modules.
  - Large callback objects / factories ➔ factory functions taking a single `deps` record (preserves closure semantics exactly).
  - Shared low-level utilities ➔ a sibling `shared/` or `utils.ts` inside the feature folder.
- **Verify**: `find src -name "*.ts" -o -name "*.tsx" | xargs wc -l | grep -v total | awk '$1>350'` must print nothing.

### 2. Folder & Filename Conventions (Clean Names)
- **Symmetrical folders**: A component's folder mirrors its name in **kebab-case**, and the folder's main entry is `index.tsx`:
  - `ChatTimeline` ➔ `src/client/components/workspace/chat-timeline/index.tsx`
  - `GitPanel` ➔ `src/client/components/workspace/git-panel/index.tsx`
  - `SessionSidebar` ➔ `src/client/components/layout/session-sidebar/index.tsx`
  - `ModelDropdown` ➔ `src/client/components/workspace/model-dropdown/index.tsx`
- **Suffix-only filenames**: When the folder already supplies the context, child files DROP the redundant prefix and keep only the suffix:
  - `src/client/components/workspace/model-dropdown/Header.tsx` — not `ModelDropdownHeader.tsx`
  - `src/client/components/workspace/git-panel/TreeView.tsx` — not `GitTreeView.tsx`
  - `src/client/components/workspace/chat-timeline/tool-renderers/panels/Bash.tsx` — not `BashPanel.tsx`
  - `src/client/hooks/chat/timeline/actions.ts` — not `useChatTimelineActions.ts`
  - `src/shared/lib/omp/rpc/manager.ts` — not `rpc-manager.ts`
- **No duplicate basenames in the same folder**: if two files would collide, move one to its correct domain folder or give it a distinguishing suffix (e.g. `panels/SearchTool.tsx` vs `panels/SearchFs.tsx`).
- **`index` is reserved for the folder's real entry point** (the main component/hook implementation) — never a re-export barrel (see rule 3).
- **Naming case**: kebab-case for folders and multi-word non-component files (`active-project.ts`, `notification-sound.ts`); PascalCase for Preact component files; `useXxx` prefix only when the file is a standalone reusable hook at a domain root.
- Reusable or cross-cutting components belong in `src/client/components/common/`.
- No empty, abandoned, or ghost folders (`src/applet/`, duplicate domain folders, etc.).

### 3. Direct, Explicit Imports (No Barrel Clutter)
- Do NOT create re-export-only `index.ts` barrels inside `src/client/components/`, `src/client/hooks/`, or `src/shared/lib/` — they pollute editor fuzzy-search and hide file origins.
- `index.tsx`/`index.ts` is allowed ONLY when it contains the folder's actual implementation (the main component/hook), not a list of `export ... from` statements.
- Import the concrete module explicitly via the `@/` alias:
  - `import { ChatTimeline } from '@/client/components/workspace/chat-timeline';` (folder entry)
  - `import { Header } from '@/client/components/workspace/model-dropdown/Header';`
  - `import { useChatTimeline } from '@/client/hooks/chat/timeline';`
  - `import { normalizeNoticePositions } from '@/shared/lib/chat/order';`
- The only intentional barrel is `src/shared/types/index.ts` (the central type barrel).

### 4. Absolute Imports via `@/` Alias (No Relative Imports)
- **All** internal imports MUST use the `@/` path alias (mapped to `./src/*` in both `tsconfig.json` and `rsbuild.config.ts`). Relative imports (`./`, `../`) are **forbidden** in application code.
- This applies to every import form: `import`, `import type`, `export ... from`, and side-effect imports.
- Examples:
  - `import { ChatTimeline } from '@/client/components/workspace/chat-timeline';`
  - `import type { OmpSession } from '@/shared/types/omp/session';`
  - `import { getDb } from '@/server/db.server';`
  - `import '@/client/tailwind.css';`
- Exceptions (keep relative):
  - Third-party packages and node built-ins (never prefixed with `@/`).
  - Assets outside `src/` (e.g., `package.json` at the project root) — use a relative path.
- The `~` alias is deprecated; use `@/` exclusively.
- **Verify**: `grep -rnE "from '\.\.?/" src --include='*.ts' --include='*.tsx' --include='*.js' | grep -v node_modules` must print nothing. `src/cli/**` is covered by this gate too — it is Bun-run plain ESM, so `@/cli/...` resolves there like everywhere else.

### 4b. Import Preact Directly (zero React packages)
- **Never write `from 'react'` or `from 'react-dom'` in `src/`.** Import the runtime directly:
  - Hooks → `import { useState, useEffect, useRef } from 'preact/hooks';`
  - Components, context, portals, and React-shaped types → `import { memo, Suspense, lazy, createContext, createPortal } from 'preact/compat';`
  - Generic element/event types → `import type { TargetedMouseEvent, TargetedKeyboardEvent } from 'preact';`
- **Zero-react state:** package.json contains no React packages and `tsconfig.json`/`rsbuild.config.ts` carry no `react*` alias. The three former shim consumers were replaced: `react-icons` → `lucide-preact` + static brand SVGs (`src/client/components/common/file-icon/`), `react-simple-code-editor` → the hand-rolled editor in `src/client/components/common/code-editor/`, `react-resizable-panels` → the hand-rolled group/panel/separator trio in `src/client/components/layout/desktop-layout/resizer/`.
- **Adding dependencies:** if a package imports `'react'` in its published code, either pick a Preact-native alternative or hand-port the small surface you need — never re-introduce a react→preact alias to accommodate it.
- **Event types:** Preact's `MouseEvent`/`KeyboardEvent` from `preact/compat` are generics requiring one type argument. Use `TargetedMouseEvent<HTMLElement>` for JSX handlers, and the DOM's own `globalThis.MouseEvent`/`globalThis.KeyboardEvent` for native `addEventListener` callbacks and xterm handlers.

### 5. Server vs Shared vs Client Modules
- **Three-way split.** `src/server/**` is Bun-only (see the Runtime section at the top), `src/client/**` is browser-only, and `src/shared/**` is imported by both. Never import a `node:` builtin or `bun:sqlite` from `src/client/**` or `src/shared/lib/**`; if a shared module needs one, it belongs in `src/server/lib/**` instead.
- Non-UI modules MUST be grouped into domain subfolders — never dumped flat in the root of `src/client/hooks/`, `src/client/data/`, `src/server/lib/`, `src/shared/lib/`, or `src/shared/types/`.
- **`src/client/hooks/<domain>/`**: `chat/`, `ui/`, `workspace/`, `browser/`, `models/`, `settings/`. Split further when a family grows: `chat/timeline/` (timeline state + actions), `chat/omp/` (live agent bridge).
- **`src/shared/lib/<domain>/`**: `chat/`, `code/`, `fs/`, `markdown/`, `models/`, `omp/`, `workspace/`. `omp/` splits into `core/`, `rpc/`, `session/`, `config/`.
- **`src/server/lib/<domain>/`**: the same domain tree, holding only the modules that touch Node/Bun builtins or the database.
- **`src/client/data/<domain>/`**: `settings/`, `samples/`, `mock/`, `models/`, `theme/`, `agent-data/`, `context-data/`.
- **`src/shared/types/<domain>/`**: group related interfaces (`settings/`, `omp/`); truly cross-cutting types stay at the root.
- Grouping changes are atomic: move the files AND update every importer in the same change.

### 6. Pure UI Components & Semantic Separation
- **`src/client/components/` is for Preact UI (`.tsx`)**. Co-located pure helpers are allowed when scoped to that feature, but must be `.ts` and live under the feature folder or its `shared/` (e.g. `tool-renderers/shared/detect-format.ts`, `editor/utils.ts`).
- Anything reusable beyond a single feature belongs in `src/shared/lib/`, never in a component folder.
- **Dedicated non-UI directories**:
  - **Hooks (`src/client/hooks/<domain>/`)**: Custom Preact hooks.
  - **Data (`src/client/data/<domain>/`)**: Mock or static datasets.
  - **Types (`src/shared/types/<domain>/`)**: Domain interfaces and types.
  - **CLI (`src/cli/`)**: The `ompchamber` command-line entry (`ompchamber.js`) and its `lib/` (arg parsing, process lifecycle, registry, serve/stop/restart/status/logs). These stay `.js` (plain ESM, no build step) and run under Bun via the `#!/usr/bin/env bun` shebang. `pkgRoot` is resolved two levels up from `src/cli/ompchamber.js`; keep that depth if the file ever moves.

### 7. Domain Types Architecture
- Domain data models and shared TypeScript interfaces must be organized cleanly under `src/shared/types/`:
  - `workspace.ts` — folders, session entities, and sorting types
  - `fs.ts` — file explorer node trees, opened files, and search result items
  - `git.ts` — git changes, branch lists, and view mode states
  - `chat.ts` — messages, agent actions, monologue, and attachments
  - `settings/` — settings state and per-category settings shapes (`agent.ts`, `command.ts`, `mcp.ts`, `project.ts`, `provider.ts`, `skill.ts`, `state.ts`)
  - `omp/` — oh-my-pi bridge types (`session.ts`, `agent.ts`)
  - `index.ts` — central export barrel for all types (`import type { ... } from '@/types'`)

### 8. Verification Requirements
- Every change must pass:
  1. `bun run lint` (`tsc --noEmit`) without errors.
  2. `bunx tsc --noEmit --noUnusedLocals --noUnusedParameters` without errors.
  3. Production build verification (`bun run build`).
- **Unused Code Check (MANDATORY before task completion)**: Before declaring any task done, verify no unused imports, locals, or dead props were introduced or left behind:
  - Fix every `TS6133` (declared but never read), `TS6192` (all imports unused), `TS6196` (declared but never used), and `TS6198` (all destructured elements unused) error.
  - Remove unused imports (icons, types, components) and unused destructured props/state — do not leave dead code behind.
  - If a component's props/state become unused because a feature was stubbed or removed, strip them from the interface, the destructure, and every call-site in the same change.
  - Do NOT ship `import React from 'react'` in `.tsx` files — the Preact JSX transform makes it unnecessary (keep named imports like `useState`).
- **Structural Checks (MANDATORY for refactors that move/rename files)**:
  - No file exceeds 350 lines (rule 1 command).
  - No relative imports remain (rule 4 command).
  - No duplicate basenames inside the same folder.
  - Every moved/renamed file's importers are updated in the same change; grep for the old path returns nothing.

### 9. Layout & Panel Resizing
- **Panel Width**: The width of the layout panels (like the sidebar or right sidebar) is calculated in **pixels**. The hand-rolled resizer (`src/client/components/layout/desktop-layout/resizer/`) sizes fixed panels with px flex-basis and lets one filler panel absorb the remainder — keep persistence and defaults in pixels, never percentages.
- **One remembered width PER PANEL, never per group**: the sidebar, the chat column, the editor panel (a separate width for source tabs and for diff tabs), and each of the eight right-panel views (`files`, `search`, `git`, `terminal`, `context`, `user-browser`, `browser`, `usage`) each own their width. The map and its slots live in `src/shared/lib/workspace/panel-widths.ts` (data) and `src/client/hooks/workspace/panel-widths.ts` (state + `desktopLayoutSizes` persistence); per-view defaults, minimums, and the view list live in `src/shared/lib/workspace/right-panels.ts`. Sharing one number between panels — or resetting a panel to a hard-coded width when it is toggled or switched — is exactly the bug this shape exists to prevent.
- **Restore through props, not imperative rebuilds**: a returning panel renders straight from the remembered pixel widths (its `defaultSize`), and the filler panel absorbs the remainder — no layout cache exists to go stale. Append an entry here if a new resizable group is introduced.

### 10. Route Organization & Domain Grouping
- **Domain-Based Subdirectories**: Routes under `src/server/routes/` MUST be organized and grouped into subdirectories matching their functional domain (e.g., `src/server/routes/settings/`, `src/server/routes/chat/`, `src/server/routes/fs/`, `src/server/routes/terminal/`, `src/server/routes/telemetry/`, `src/server/routes/sessions/`, `src/server/routes/files/`, `src/server/routes/folders/`).
- **No Monolithic Flat Folder Clutter**: Do NOT dump API endpoints loosely in the root of `src/server/routes/` as flat files. `src/server/routes/index.ts` is the only file that enumerates domains; every domain folder owns its own modules and never imports a sibling domain.
- **One Elysia plugin per domain**: Each domain folder exports `HandlerBinding[]` built from its route modules (see `src/server/lib/route-adapter.ts`). Route modules keep the ported Remix shape — an exported `loader` (GET) and/or `action` (mutating verbs) — so status codes and payloads stay identical to the pre-migration API. Prefixes are declared once, in `routes/index.ts`.

### 11. Environment Data Modes (`MOCK=true` vs `MOCK=false`)
- **`MOCK=true` (Simulation & Demo Mode)**:
  - All features and loaders utilize rich predefined datasets and presets from `src/client/data/` (simulated demo chats, token telemetry ranges, agent/project presets).
  - Database seeding automatically injects sample workspace folders, demo commit sessions, and file structures.
- **`MOCK=false` (Real Data Mode)**:
  - The application operates strictly against real backend resources and real SQLite database persistence.
  - No synthetic sample sessions, fake dialogues, or hardcoded mock files are auto-injected.
  - Managed globally through `Bun.env.MOCK` and verified via `@/server/mock.server`.

