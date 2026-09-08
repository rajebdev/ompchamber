# AGENTS.md — OMPChamber AI System Instructions & Protocols

## Overview
**OMPChamber** serves as the developer web view console and diagnostic chamber for **AI Oh-My-Pi** (`oh-my-pi`), integrated with **remisJS** and **bun** runtime environments.

---

## Architecture & Agent Roles

### 1. The Oh-My-Pi Autonomous Agent (`oh-my-pi`)
- **Primary Function**: Autonomous CI/CD pipeline monitoring, build log analysis, dependency resolution, and edge deployment verification.
- **Runtime Target**: Bun v1.2.4 with native ESM and TypeScript striping.
- **Framework Integration**: remisJS edge routes & build plugins.

### 2. OMPChamber Web View Interface
- **Sidebar**: Fixed ~240px e-ink paper navigation with environment status glyphs and build minute quota tracking.
- **Navbar**: Deployment breadcrumb, All/Production/Preview segmented filter, and action triggers.
- **Right Sidebar Double Panel**:
  - **Panel 1 (`oh-my-pi`)**: Interactive assistant chamber for prompt evaluations, diagnostic commands, and real-time build patches.
  - **Panel 2 (`inspector`)**: Deep telemetry matrix, stage-by-stage timing breakdowns, commit diffs, and environment configurations.
- **Right Sidebar Button (`RightSidebarBtn`)**: Immediate toggle control embedded in the header bar.

---

## Agent Operational Workflows

### Diagnostic Protocol on Build Failures
1. **Log Scrape**: Scrape build output from bun runner (matching `exit 1` conditions).
2. **Error Isolation**: Target the root failure point (e.g., missing package imports, type mismatch, or invalid asset clipping).
3. **Patch Generation**: Formulate a runnable bun terminal command (e.g., `bun add @superdesign/svg-geometry@latest && bun run build`).
4. **Execution in Chamber**: The user or agent triggers execution directly in the right sidebar chamber panel.

### 3. Code Style & Persistence Guidelines
- Use the CSS variable system defined in `app/tailwind.css` (`var(--theme-ink)`, `var(--theme-paper)`, etc.) and standard Tailwind classes mapped to them (`bg-paper`, `text-ink`, `border-ink/20`).
- The application supports multiple themes (e.g., E-Ink Paper Monochrome, One Dark Pro Soft). **DO NOT** hardcode raw hex colors like `#141310` or `#faf8f3` in component files.
- Semantic states are expressed purely through these theme variables.
- The only allowable chroma (outside of dark theme) is the signal red variable `var(--theme-error)` (`text-error`, `bg-error`) reserved for failures and error messages.

---

## Codebase Architecture & File Organization Rules

### 1. File Size Ceiling
- **Maximum 350 Lines Per File**: Every TypeScript and TSX file must strictly stay under 350 lines of code.
- **Decomposition**: If a component approaches this threshold, decompose it immediately into sub-components, helper utilities, or domain modals rather than allowing monolithic files to grow.

### 2. Symmetrical Folder Naming Conventions
- Sub-component directories must mirror their parent component name in **kebab-case**:
  - `ChatTimeline.tsx` ➔ `app/components/workspace/chat-timeline/`
  - `FileExplorer.tsx` ➔ `app/components/workspace/file-explorer/`
  - `GitPanel.tsx` ➔ `app/components/workspace/git-panel/`
  - `SessionSidebar.tsx` ➔ `app/components/layout/session-sidebar/`
- Reusable or cross-cutting components belong in `app/components/common/`.
- No empty, abandoned, or ghost folders (`app/applet/`, duplicate `routes/api+`, etc.).

### 3. Direct, Explicit Imports (No Barrel Clutter)
- Avoid redundant `index.ts` barrel files inside `app/components/` to prevent editor fuzzy-search pollution and keep file origins crystal clear.
- Consumers import components directly and explicitly via clean path aliases:
  - `import { ChatTimeline } from '@/components/workspace/ChatTimeline';`
  - `import { SessionSidebar } from '@/components/layout/SessionSidebar';`
  - `import { PWAInstallButton } from '@/components/common/PWAInstallButton';`

### 4. Absolute Imports via `@/` Alias (No Relative Imports)
- **All** internal imports MUST use the `@/` path alias (mapped to `./app/*` in both `tsconfig.json` and `vite.config.ts`). Relative imports (`./`, `../`) are **forbidden** in application code.
- This applies to every import form: `import`, `import type`, `export * from`, and side-effect imports.
- Examples:
  - `import { ChatTimeline } from '@/components/workspace/ChatTimeline';`
  - `import type { OmpSession } from '@/types/omp';`
  - `import { getDb } from '@/db.server';`
  - `import '@/tailwind.css';`
- Exceptions (keep relative):
  - Third-party packages and node built-ins (never prefixed with `@/`).
  - Assets outside `app/` (e.g., `package.json` at the project root) — use `@/../package.json` or a relative path.
- The `~` alias is deprecated; use `@/` exclusively.

### 5. Pure UI Components & Semantic Separation
- **`app/components/` is strictly for React UI (`.tsx`)**:
  - No mixed `.ts` utility, data, or hook files inside component folders.
- **Dedicated non-UI directories**:
  - **Hooks (`app/hooks/`)**: Custom React hooks (e.g., `useOnClickOutside.ts`).
  - **Data (`app/data/`)**: Mock or static datasets (e.g., `chatMockData.ts`).
  - **Types (`app/types/`)**: Domain interfaces and types (`workspace.ts`, `fs.ts`, `git.ts`, `chat.ts`).

### 6. Domain Types Architecture
- Domain data models and shared TypeScript interfaces must be organized cleanly under `app/types/`:
  - `workspace.ts` — folders, session entities, and sorting types
  - `fs.ts` — file explorer node trees, opened files, and search result items
  - `git.ts` — git changes, branch lists, and view mode states
  - `chat.ts` — messages, agent actions, monologue, and attachments
  - `index.ts` — central export barrel for all types (`import type { ... } from '@/types'`)

### 7. Verification Requirements
- Every change must pass:
  1. `npm run lint` (`tsc --noEmit`) without errors.
  2. Production build verification (`compile_applet`).
- **Unused Code Check (MANDATORY before task completion)**: Before declaring any task done, verify no unused imports, locals, or dead props were introduced or left behind:
  - Run `npx tsc --noEmit --noUnusedLocals --noUnusedParameters` and fix every `TS6133` (declared but never read), `TS6192` (all imports unused), `TS6196` (declared but never used), and `TS6198` (all destructured elements unused) error it reports.
  - Remove unused imports (icons, types, components) and unused destructured props/state — do not leave dead code behind.
  - If a component's props/state become unused because a feature was stubbed or removed, strip them from the interface, the destructure, and every call-site in the same change.
  - Do NOT ship `import React from 'react'` in `.tsx` files — the React 19 JSX transform makes it unnecessary (keep named imports like `useState`).

### 8. Layout & Panel Resizing
- **Panel Width**: Be aware that the width of the layout panels (like the sidebar or right sidebar) is considered and calculated in **pixels**. When handling layout persistence or default sizes, ensure they are treated as pixel values rather than just percentages, adapting library APIs (like `react-resizable-panels`) as needed to accommodate pixel-based design intent.

### 9. Route Organization & Domain Grouping
- **Domain-Based Subdirectories**: Routes under `app/routes/` MUST be organized and grouped into subdirectories matching their functional domain (e.g., `app/routes/api/settings/`, `app/routes/api/chat/`, `app/routes/api/fs/`, `app/routes/api/terminal/`, `app/routes/api/telemetry/`, `app/routes/api/sessions/`, `app/routes/api/files/`, `app/routes/api/folders/`).
- **No Monolithic Flat Folder Clutter**: Do NOT dump all API route endpoints loosely in the root of `app/routes/api/` as flat files. Group related child endpoints inside domain folders (e.g., `settings/route.ts`, `settings/agents.ts`, `settings/providers.ts`).
- **Nested & Parametric Routes**: Parametric and dynamic routes follow Remix flat-routes directory nesting conventions (e.g., `chat/$sessionId.ts`, `sessions/$sessionId.queue.ts`).

### 10. Environment Data Modes (`MOCK=true` vs `MOCK=false`)
- **`MOCK=true` (Simulation & Demo Mode)**:
  - All features and loaders utilize rich predefined datasets and presets from `app/data/` (simulated demo chats, token telemetry ranges, agent/project presets).
  - Database seeding automatically injects sample workspace folders, demo commit sessions, and file structures.
- **`MOCK=false` (Real Data Mode)**:
  - The application operates strictly against real backend resources and real SQLite database persistence.
  - No synthetic sample sessions, fake dialogues, or hardcoded mock files are auto-injected.
  - Managed globally through `process.env.MOCK` and verified via `@/mock.server`.

