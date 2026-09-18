# OMPChamber Migration: Remix + React 19 + Vite → ElysiaJS + Preact + Rsbuild + Bun

**Status:** Proposal / planning document
**Target stack:** ElysiaJS 1.4.x · Preact 10.29.x · Rsbuild 2.x · Bun 1.4.x
**Current stack:** Remix v2 (`@remix-run/*` 2.17) · React 19 · Vite 6 · Express 4 · `sqlite3` (N-API) · Node 26 / Bun 1.4
**Scope:** Full-stack rewrite of the runtime + view layer, preserving every feature, endpoint, and design token.

---

## 0. TL;DR — Read this first

| Question | Answer |
|---|---|
| Is this a realistic migration? | Yes. ~72k LOC, but the code is already **domain-layered and Remix-thin**: only **17 files** touch Remix APIs directly, and every UI route is already a client-rendered shell that fetches `/api/*`. |
| Biggest win | The Remix router is doing almost nothing for you. `_index.tsx` is the only real page; the sidebar/session list was already decoupled from SSR (commit `1d7cf8a`). Replacing the router costs ~1 week, not ~1 month. |
| Biggest risk | **`motion/react` is explicitly incompatible with Preact** (the maintainer closed the Preact issue as "not supported"). One component uses it: `chat-timeline/tool-renderers/ask-dialog/index.tsx`. Must be replaced. |
| Second risk | `sqlite3` (native N-API addon) *does* load under Bun (verified), but it is the wrong dependency under Bun. Migrate to `bun:sqlite` — the call sites are 164, across 38 files, and the API differs (`lastID` → `lastInsertRowid`, callbacks → sync). |
| Third risk | The dev server. Today Vite hosts the app **and** the agent WebSocket. Under the new stack, Elysia must host both, with Rsbuild running in middleware mode for HMR. This is the one genuinely new integration to build. |
| Recommended approach | **Strangler, 6 phases**, each independently shippable. Do **not** do a big-bang rewrite. Phase 3 (Elysia API) can land before Phase 4 (Preact) touches anything. |

---

## 1. Current-state inventory

### 1.1 By the numbers

| Area | Files | LOC | Notes |
|---|---|---|---|
| `app/components/` | 229 | 32,421 | 5 top groups: `workspace`, `settings`, `layout`, `mobile`, `common` |
| `app/lib/` | 154 | 18,951 | 107 client-safe, ~47 server-only (node builtins) |
| `app/routes/` | 66 | 6,240 | 64 API routes + `_index.tsx` + `$.tsx` |
| `app/hooks/` | 49 | 5,790 | `chat/`, `workspace/`, `ui/`, `models/`, `settings/`, `browser/` |
| `app/data/` | 29 | 5,107 | mock presets, samples, theme, model catalog |
| `app/types/` | 22 | 1,392 | domain types + central barrel |
| `server/` | 2 | 279 | Express prod entry + agent WebSocket |
| `bin/` | 9 | ~1,200 | CLI: `serve/stop/restart/status/logs` |
| **Total** | **~560** | **~71,900** | |

Tests: 7 `*.test.ts` files (Bun test runner already).

### 1.2 Runtime topology today

```
┌──────────────────────────────────────────────────────────────────────┐
│  DEV: `remix vite:dev --port=3000`                                   │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │ Vite dev server (http.Server)                                  │  │
│  │  ├─ Remix plugin  ──► SSR routes + API routes (loaders/actions)│  │
│  │  ├─ Tailwind v4 plugin                                         │  │
│  │  ├─ agentStreamWebSocket() plugin ──► ws upgrade handler       │  │
│  │  └─ HMR socket                                                 │  │
│  └────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────┐
│  PROD: `node server/index.js` (also `ompchamber serve --prod`)       │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │ Express 4                                                      │  │
│  │  ├─ compression() (skips text/event-stream)                    │  │
│  │  ├─ express.static(build/client/assets, immutable, 1y)         │  │
│  │  ├─ express.static(public, 1h)                                 │  │
│  │  ├─ app.all('*') ──► @remix-run/express createRequestHandler   │  │
│  │  └─ http.createServer(app)                                     │  │
│  │       └─ attachAgentStreamWebSocket(server)                    │  │
│  └────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────┘
```

**Critical shared state:** the omp RPC session registry lives on `globalThis.__ompSessions` (`app/lib/omp/rpc/session-registry.ts`). `server/agent-stream-websocket.js` reads it from outside the app bundle via duck-typing. **This decoupling is the single most important architectural asset in the repo** — it means the WebSocket transport does not care which framework owns the HTTP server, and it survives the migration unchanged (modulo the Elysia `.ws()` rewrite).

### 1.3 The omp RPC bridge (the heart of the app)

```
Client (chat timeline)
  │  POST /api/agent/:sessionId   {type: 'prompt'|'abort'|...}
  ▼
app/routes/api/agent/$sessionId.ts
  │  startRpcSession() / getRpcSession()   ← globalThis.__ompSessions
  ▼
app/lib/omp/rpc/manager.ts  (AgentSessionWrapper)
  │  spawn('omp', ['--mode','rpc-ui', ...])   ← child_process
  ▼
omp binary (user-installed)  ──JSON frames──►  wrapper.onEvent()
  │
  ├─► SSE   GET /api/agent/:sessionId/events   (ReadableStream, 30s heartbeat, message_update coalescing)
  └─► WS    GET /api/agent/:sessionId/ws       (ws lib, ping/pong, 256KB high-water mark)
```

Both transports emit the **same frame vocabulary** and the client folds them in `app/lib/chat/omp/agent-events.ts`. Migration must preserve: `connected` first frame, `message_update` latest-wins coalescing, 30s keepalive, and the `409` "session is not managed by the chamber" refusal.

### 1.4 Every Remix surface that must be replaced

Only **17 files** import `@remix-run/*` in the UI layer. This is the complete list:

| File | Remix API used | Replacement |
|---|---|---|
| `app/root.tsx` | `Links`, `Meta`, `Outlet`, `Scripts`, `ScrollRestoration`, `useLoaderData`, `LinksFunction` | `index.html` template + a `ThemeProvider` that reads `/api/settings` |
| `app/routes/_index.tsx` | `useLoaderData`, `useSearchParams`, `MetaFunction`, `json` | `App.tsx` root component + `useSearchParams` shim |
| `app/routes/$.tsx` | `loader` | Elysia catch-all `404` + `.well-known` route |
| `app/components/layout/desktop-layout/index.tsx` | `useSearchParams` | `@/lib/router/search-params` shim |
| `app/components/layout/session-sidebar/index.tsx` | `useSearchParams` | shim |
| `app/components/layout/session-sidebar/SubagentList.tsx` | `useSearchParams` | shim |
| `app/components/layout/session-sidebar/CategoryItem.tsx` | `useFetcher`, `useSearchParams` | `useApiMutation` hook (plain `fetch`) |
| `app/components/mobile/LayoutWrapper.tsx` | `useSearchParams` | shim |
| `app/components/mobile/mobile-session-sidebar/Item.tsx` | `useFetcher` | `useApiMutation` |
| `app/components/workspace/chat-timeline/index.tsx` | `useSearchParams` | shim |
| `app/components/workspace/context-panel/index.tsx` | `useSearchParams` | shim |
| `app/components/workspace/diff-panel/index.tsx` | `useFetcher` | `useApiMutation` |
| `app/components/workspace/SearchPanel.tsx` | `useFetcher` | `useApiMutation` |
| `app/components/workspace/git-panel/index.tsx` | `useFetcher` | `useApiMutation` |
| `app/components/workspace/file-explorer/TreeItem.tsx` | `useFetcher` | `useApiMutation` |
| `app/hooks/chat/omp/session-list.tsx` | `useFetcher` | `useApiQuery` (shared provider) |
| `app/hooks/chat/timeline/index.ts` | `useSearchParams` | shim |

**Totals:** `useSearchParams` × 9 files, `useFetcher` × 7 files, `useLoaderData` × 2 files, `json()` × 54 files (server-side only, trivial), `Link` × 0 real uses (only `ExternalLink` icon names matched).

**No `useNavigate`, no `NavLink`, no `<Form>`, no `useSubmit`, no `useRevalidator`, no `useNavigation`, no `ErrorBoundary`, no `useRouteError`, no `useActionData`.** The routing dependency is genuinely shallow.

---

## 2. Target architecture

```
┌────────────────────────────────────────────────────────────────────────────┐
│  ONE process, ONE port, ONE HTTP server (Bun.serve via Elysia)             │
│                                                                            │
│  Elysia 1.4 app                                                            │
│   ├─ /api/*        ── Elysia route modules (domain-grouped, as today)      │
│   ├─ /api/agent/:id/ws    ── .ws()  (agent event stream, default)          │
│   ├─ /api/agent/:id/events ── sse() (fallback transport)                   │
│   ├─ /api/*/stream        ── sse()  (terminal, browser screencast, chat)   │
│   ├─ /              ── Preact SSR via preact-render-to-string             │
│   ├─ /assets/*      ── @elysiajs/static (immutable, hashed)                │
│   └─ /              ── @elysiajs/static indexHTML: true  (SPA fallback)    │
│                                                                            │
│  DEV ONLY: Rsbuild middleware mounted into Elysia (HMR + on-demand build)  │
│  PROD:     Rsbuild prebuilt to dist/{client,server} at `bun run build`     │
└────────────────────────────────────────────────────────────────────────────┘
```

### 2.1 Why this shape

1. **Elysia owns the port.** This is the whole point — the current Express prod entry exists only because `remix-serve` "exposes no upgrade hook". Elysia exposes `.ws()` natively, so the WebSocket stops being a special case and becomes a first-class route.
2. **Preact over React** cuts the client runtime from ~45 kB to ~4 kB gzipped. The compat alias means **you do not rewrite 229 components**.
3. **Rsbuild over Vite** gives one build tool for client + SSR + the CLI bundle, with a 10–20× faster cold build on a repo this size (Rspack v2 is Rust-native).
4. **Bun end-to-end** removes `sqlite3`'s N-API boundary, removes `tsx`/`ts-node` entirely, and lets `ompchamber` ship as a `bun build --compile` single binary later (Phase 6).

### 2.2 Directory layout (target)

**Route modules are grouped into domain subfolders — one folder per API domain, mirroring today's `app/routes/api/*` layout.** `AGENTS.md` §10 forbids a flat route dump, and that rule survives the migration unchanged: Elysia route modules replace Remix flat-routes, but the folder discipline stays.

```
ompchamber/
├── src/
│   ├── server/                        # Elysia — replaces app/routes/api/**
│   │   ├── index.ts                   #   app factory + listen + shutdown
│   │   ├── plugins/
│   │   │   ├── static.ts              #   @elysiajs/static wiring
│   │   │   ├── compress.ts            #   gzip/br (skip text/event-stream)
│   │   │   ├── error.ts               #   global onError → legacy {error, code} envelope
│   │   │   └── ssr.ts                 #   Preact SSR + SPA fallback
│   │   ├── routes/                    #   one folder per API domain — NEVER flat
│   │   │   ├── index.ts               #   composes every domain into one plugin
│   │   │   ├── agent/
│   │   │   │   ├── index.ts           #   /api/agent/:sessionId (POST cmd, GET state)
│   │   │   │   ├── new.ts             #   /api/agent/new
│   │   │   │   ├── prewarm.ts         #   /api/agent/prewarm
│   │   │   │   ├── events.ts          #   /api/agent/:sessionId/events  (SSE fallback)
│   │   │   │   ├── ws.ts              #   /api/agent/:sessionId/ws      (default transport)
│   │   │   │   └── errors.ts          #   WebRpcError / typed error mapping
│   │   │   ├── chat/
│   │   │   │   ├── index.ts           #   /api/chat (list + upsert)
│   │   │   │   ├── session.ts         #   /api/chat/:sessionId (GET/POST/PUT/DELETE)
│   │   │   │   ├── rewind.ts          #   /api/chat/:sessionId/rewind
│   │   │   │   └── stream.ts          #   /api/chat/stream  (MOCK-only Gemini SSE)
│   │   │   ├── sessions/
│   │   │   │   ├── index.ts           #   /api/sessions/list
│   │   │   │   ├── folder.ts          #   /api/sessions/:folderId
│   │   │   │   ├── session.ts         #   rename / archive / state / queue / stream-seen
│   │   │   │   └── subagents.ts       #   /api/sessions/:sessionId/subagents[/:subagentId]
│   │   │   ├── settings/
│   │   │   │   ├── index.ts           #   /api/settings (key-value bag)
│   │   │   │   ├── agents.ts          #   /api/settings/agents
│   │   │   │   ├── behavior.ts        #   /api/settings/behavior
│   │   │   │   ├── commands.ts        #   /api/settings/commands
│   │   │   │   ├── mcp.ts             #   /api/settings/mcp
│   │   │   │   ├── mcp-test.ts        #   /api/settings/mcp-test
│   │   │   │   ├── omp-config.ts      #   /api/settings/omp-config
│   │   │   │   ├── projects.ts        #   /api/settings/projects
│   │   │   │   ├── provider-models.ts #   /api/settings/provider-models
│   │   │   │   ├── providers.ts       #   /api/settings/providers
│   │   │   │   ├── skills.ts          #   /api/settings/skills
│   │   │   │   └── usage.ts           #   /api/settings/usage
│   │   │   ├── fs/
│   │   │   │   ├── index.ts           #   /api/fs (dir, list, read, browse)
│   │   │   │   ├── action.ts          #   /api/fs/action (save/create/rename/delete)
│   │   │   │   ├── git.ts             #   /api/fs/git  (status/diff/stage/commit)
│   │   │   │   ├── replace.ts         #   /api/fs/replace
│   │   │   │   ├── search.ts          #   /api/fs/search
│   │   │   │   └── validate.ts        #   /api/fs/validate
│   │   │   ├── folders/
│   │   │   │   ├── index.ts           #   /api/folders (create)
│   │   │   │   └── folder.ts          #   /api/folders/:folderId (pin/toggle/delete/settings)
│   │   │   ├── files/
│   │   │   │   ├── index.ts           #   /api/files/:sessionId
│   │   │   │   └── toggle.ts          #   /api/files/:fileId/toggle
│   │   │   ├── telemetry/
│   │   │   │   ├── context.ts         #   /api/telemetry/context
│   │   │   │   ├── tokens.ts          #   /api/telemetry/tokens
│   │   │   │   └── raw-messages.ts    #   /api/telemetry/raw-messages
│   │   │   ├── terminal/
│   │   │   │   ├── run.ts             #   /api/terminal/run
│   │   │   │   └── stream.ts          #   /api/terminal/stream  (SSE)
│   │   │   ├── browser/
│   │   │   │   └── stream.ts          #   /api/browser/:sessionId/stream  (CDP screencast SSE)
│   │   │   ├── models/
│   │   │   │   ├── index.ts           #   /api/models
│   │   │   │   └── roles.ts           #   /api/model-roles
│   │   │   ├── omp/
│   │   │   │   ├── index.ts           #   /api/omp/state, sidebar, session-stats
│   │   │   │   ├── commands.ts        #   /api/omp/commands
│   │   │   │   ├── extensions.ts      #   /api/omp/extensions
│   │   │   │   ├── login.ts           #   /api/omp/login  (SSE)
│   │   │   │   ├── plugins.ts         #   /api/omp/plugins
│   │   │   │   └── pricing.ts         #   /api/omp/pricing
│   │   │   ├── updates/
│   │   │   │   ├── apply.ts           #   /api/updates/apply
│   │   │   │   └── check.ts           #   /api/updates/check
│   │   │   ├── health/
│   │   │   │   └── index.ts           #   /api/health  (CLI readiness probe)
│   │   │   └── well-known/
│   │   │       └── devtools.ts        #   /.well-known/appspecific/com.chrome.devtools.json
│   │   └── lib/                       #   (moved from app/lib/** — server half)
│   ├── client/                        # Preact — replaces app/components|hooks|data
│   │   ├── main.tsx                   #   hydrate()
│   │   ├── App.tsx                    #   replaces app/routes/_index.tsx
│   │   ├── components/                #   ported 1:1 from app/components/**
│   │   ├── hooks/                     #   ported 1:1 from app/hooks/**
│   │   ├── data/                      #   ported 1:1 from app/data/**
│   │   └── lib/                       #   ported from the 107 client-safe app/lib files
│   ├── shared/                        # types + pure helpers used by BOTH sides
│   │   ├── types/                     #   moved from app/types/**
│   │   └── lib/                       #   e.g. chat/order.ts, workspace/panel-widths.ts
│   ├── ssr/
│   │   └── entry-server.tsx           #   renderToString(<App/>) + theme injection
│   └── cli/                           #   moved from bin/**
├── rsbuild.config.ts
├── public/                            # unchanged (icons, manifest, sw.js)
├── index.html                         # Rsbuild HTML template (replaces root.tsx shell)
├── tailwind.css                       # unchanged
└── package.json
```

**Folder rules (carried over from `AGENTS.md` §2, §10):**

| Rule | Applied to `src/server/routes/` |
|---|---|
| One folder per API domain | `agent/`, `chat/`, `sessions/`, `settings/`, `fs/`, `folders/`, `files/`, `telemetry/`, `terminal/`, `browser/`, `models/`, `omp/`, `updates/`, `health/`, `well-known/` — 15 folders, matching the 14 current `app/routes/api/*` folders plus the new `well-known/` |
| `index.ts` = the folder's real entry | `settings/index.ts` **contains** the `settingsRoutes` Elysia instance (the `/api/settings` root handler), not a re-export barrel |
| Suffix-only filenames | `agent/ws.ts` not `agent/agent-ws.ts`; `sessions/session.ts` not `sessions/sessions-session.ts` |
| No duplicate basenames in one folder | `fs/index.ts` + `fs/git.ts` + `fs/action.ts` — each name unique within `fs/` |
| Kebab-case for multi-word files | `omp-config.ts`, `mcp-test.ts`, `raw-messages.ts`, `provider-models.ts` |
| No file over 350 lines | `settings/` splits into 12 files for exactly this reason — `mcp.ts` alone is 284 lines today |

> **Why split by domain at all?** Two reasons beyond style: (1) Elysia plugins compose cleanly — each domain folder exports one `new Elysia({ prefix: '/api/<domain>' })` and `routes/index.ts` chains them, so a route's prefix is declared once and never repeated; (2) a 350-line ceiling on a 64-endpoint surface means `routes/` would need ~30 flat files, which is exactly the "monolithic flat folder clutter" `AGENTS.md` §10 bans.

### 2.3 Route composition

Each domain folder exports exactly one composed plugin. `routes/index.ts` is the only place that knows the full route table:

```ts
// src/server/routes/index.ts
import { Elysia } from 'elysia';
import { agentRoutes } from '@/server/routes/agent';
import { chatRoutes } from '@/server/routes/chat';
import { sessionsRoutes } from '@/server/routes/sessions';
import { settingsRoutes } from '@/server/routes/settings';
import { fsRoutes } from '@/server/routes/fs';
import { foldersRoutes } from '@/server/routes/folders';
import { filesRoutes } from '@/server/routes/files';
import { telemetryRoutes } from '@/server/routes/telemetry';
import { terminalRoutes } from '@/server/routes/terminal';
import { browserRoutes } from '@/server/routes/browser';
import { modelsRoutes } from '@/server/routes/models';
import { ompRoutes } from '@/server/routes/omp';
import { updatesRoutes } from '@/server/routes/updates';
import { healthRoutes } from '@/server/routes/health';
import { wellKnownRoutes } from '@/server/routes/well-known';

export const apiRoutes = new Elysia()
  .use(agentRoutes)
  .use(chatRoutes)
  .use(sessionsRoutes)
  .use(settingsRoutes)
  .use(fsRoutes)
  .use(foldersRoutes)
  .use(filesRoutes)
  .use(telemetryRoutes)
  .use(terminalRoutes)
  .use(browserRoutes)
  .use(modelsRoutes)
  .use(ompRoutes)
  .use(updatesRoutes)
  .use(healthRoutes)
  .use(wellKnownRoutes);
```

Each domain folder's `index.ts` follows the same shape:

```ts
// src/server/routes/agent/index.ts
import { Elysia } from 'elysia';
import { agentCommandRoutes } from '@/server/routes/agent/command';
import { agentNewRoutes } from '@/server/routes/agent/new';
import { agentPrewarmRoutes } from '@/server/routes/agent/prewarm';
import { agentEventsRoutes } from '@/server/routes/agent/events';
import { agentWsRoutes } from '@/server/routes/agent/ws';

export const agentRoutes = new Elysia({ prefix: '/api/agent' })
  .use(agentCommandRoutes)
  .use(agentNewRoutes)
  .use(agentPrewarmRoutes)
  .use(agentEventsRoutes)
  .use(agentWsRoutes);
```

> **Prefix rule:** the prefix lives on the **domain** plugin only. Child modules declare bare paths (`/new`, `/prewarm`, `/:sessionId/events`) so the URL shape exists in exactly one place. If a child needs a different prefix, it gets its own folder.

> **Import rule:** every internal import uses the `@/` alias (`@/server/routes/...`), per `AGENTS.md` §4. No relative imports — the existing `grep -rnE "from '\.\.?/" src` gate catches violations.

---

## 3. Dependency migration matrix

### 3.1 Direct dependencies

| Package | Current | Preact verdict | Action |
|---|---|---|---|
| `react` / `react-dom` | 19.0.1 | — | **Remove.** Alias `react*` → `preact/compat` in Rsbuild. |
| `@remix-run/{node,react,express,dev}` | 2.17.5 | — | **Remove** all four. |
| `express` | 4.20 | — | **Remove** (Elysia replaces it). |
| `compression` | 1.8.1 | — | **Remove.** Use `elysia-compress` **or** Bun's built-in `zlib` in a `mapResponse` hook. Must skip `text/event-stream` (see §5.4). |
| `vite` + `@tailwindcss/vite` | 6.2.3 / 4.1.14 | — | **Remove.** Rsbuild + `@tailwindcss/postcss`. |
| `remix-flat-routes` | 0.8.5 | — | **Remove** (Elysia route modules are explicit). |
| `vite-plugin-pwa` | 1.3.0 | — | **Remove.** It was never wired (no `VitePWA` call); `public/sw.js` + `public/manifest.webmanifest` are hand-written. Keep them as-is. |
| `sqlite` + `sqlite3` | 5.1.1 / 5.1.7 | Bun loads it, but it is an N-API addon | **Replace with `bun:sqlite`.** See §4. |
| `ws` | 8.18 | — | **Remove.** Elysia `.ws()` wraps `Bun.serve`'s native WebSocket. |
| `isbot` | 4 | — | **Remove** if unused (verified: zero imports). |
| `lucide-react` | 0.546 | ✅ Compat works, but a native port exists | **Swap to `lucide-preact`** (official, same icons, tree-shakable). Used in **162 files** — a one-line `sed` on the import specifier; icon names are identical. |
| `react-icons` | 5.7 | ⚠️ Renders via `react` → compat; works but pulls React types | **Keep via compat** initially. Used in exactly 1 file (`common/FileIcon.tsx`). Optionally hand-port to inline SVGs later. |
| `react-resizable-panels` | 4.12.4 | ⚠️ Uses refs + context; compat handles it, but no official Preact statement | **Keep via compat, verify early** (Phase 4 gate). This is the #1 layout-critical dependency. If it breaks, the fallback is a ~150 LOC custom splitter — the repo already treats panel widths as pixel values (`app/lib/workspace/panel-widths.ts`). |
| `motion` | 13.2 | ❌ **Not supported.** Maintainer closed the Preact issue | **Replace.** Single consumer: `tool-renderers/ask-dialog/index.tsx` (enter/exit fade). Replace with CSS transitions + `@starting-style`, or `preact-iso`'s transition helpers. |
| `react-simple-code-editor` | 0.14.1 | ✅ Simple textarea overlay; compat-safe | **Keep via compat.** |
| `dompurify` | 3.4.15 | ✅ Framework-agnostic | **Keep.** |
| `marked` / `marked-linkify-it` / `remend` / `katex` / `prismjs` | — | ✅ Framework-agnostic | **Keep.** |
| `mermaid` | 12.0 | ✅ Framework-agnostic (dynamic import) | **Keep.** |
| `@xterm/xterm` + `addon-fit` | 6.0 / 0.11 | ✅ Framework-agnostic | **Keep.** |
| `@google/genai` | 2.21 | ✅ Server-side only (mock streaming path) | **Keep.** |
| `yaml` | 2.9 | ✅ | **Keep.** |
| `@fontsource/fira-code` | 5.3 | ✅ | **Keep.** |

### 3.2 New dependencies

| Package | Version | Why |
|---|---|---|
| `elysia` | ^1.4.30 | HTTP framework |
| `@elysiajs/static` | ^1.4.10 | Hashed assets + SPA fallback (`indexHTML: true`) |
| `elysia-compress` *(or hand-rolled)* | latest | gzip/br, with `compressStream: false` for SSE |
| `preact` | ^10.29.8 | UI runtime |
| `preact-render-to-string` | ^6.7.0 | SSR (`renderToStringAsync`, or streaming) |
| `@preact/signals` *(optional)* | latest | Only if you want fine-grained reactivity for the chat stream — **not required** |
| `@rsbuild/core` | ^2.2.7 | Build tool |
| `@rsbuild/plugin-preact` | ^2.1.0 | Preact + JSX + prefresh HMR + compat aliases |
| `@tailwindcss/postcss` | ^4.x | Tailwind v4 via PostCSS (Rsbuild-native path) |
| `lucide-preact` | ^1.47.0 | Official Preact icon port |

### 3.3 Removals

```
@remix-run/node  @remix-run/react  @remix-run/express  @remix-run/dev
express  compression  ws  isbot  sqlite  sqlite3
vite  @tailwindcss/vite  remix-flat-routes  vite-plugin-pwa
react  react-dom  @types/react  @types/react-dom
lucide-react  motion
```

---

## 4. Phase 1 — Bun SQLite (do this FIRST, standalone)

`bun:sqlite` is **synchronous**. That is a feature, not a bug: it removes an entire class of `await` noise and makes `withTransaction` trivial. But it changes every call site.

### 4.1 API diff

| `sqlite` (current) | `bun:sqlite` (target) |
|---|---|
| `await open({filename, driver})` | `new Database(path, { create: true })` |
| `await db.get(sql, [a])` | `db.query(sql).get(a)` — **sync** |
| `await db.all(sql, [a])` | `db.query(sql).all(a)` — **sync** |
| `await db.run(sql, [a])` | `db.run(sql, [a])` — **sync** |
| `result.lastID` | `result.lastInsertRowid` |
| `result.changes` | `result.changes` ✅ |
| `db.exec(sql)` | `db.exec(sql)` ✅ |

Verified against Bun 1.4.0:
```bash
$ bun -e "const {Database}=require('bun:sqlite'); const d=new Database(':memory:');
  d.exec('CREATE TABLE t(id INTEGER PRIMARY KEY, v TEXT)');
  console.log(JSON.stringify(d.run('INSERT INTO t (v) VALUES (?)',['x'])));"
{"changes":1,"lastInsertRowid":1}
```

### 4.2 The compat shim (recommended)

Do **not** rewrite 164 call sites by hand in one commit. Ship a thin adapter that keeps the current `await db.get(...)` shape and swaps the engine underneath:

```ts
// src/server/lib/db/client.ts
import { Database } from 'bun:sqlite';

export interface DbClient {
  get<T>(sql: string, params?: unknown[]): Promise<T | undefined>;
  all<T>(sql: string, params?: unknown[]): Promise<T[]>;
  run(sql: string, params?: unknown[]): Promise<{ changes: number; lastID: number }>;
  exec(sql: string): Promise<void>;
  raw: Database;
}

export function createDb(path: string): DbClient {
  const raw = new Database(path, { create: true });
  raw.exec('PRAGMA journal_mode = WAL');
  raw.exec('PRAGMA foreign_keys = ON');

  // Prepared-statement cache: bun:sqlite statements are reusable and fast.
  const stmts = new Map<string, ReturnType<Database['query']>>();
  const prep = (sql: string) => {
    let s = stmts.get(sql);
    if (!s) { s = raw.query(sql); stmts.set(sql, s); }
    return s;
  };

  return {
    async get<T>(sql, params = []) { return prep(sql).get(...params) as T | undefined; },
    async all<T>(sql, params = []) { return prep(sql).all(...params) as T[]; },
    async run(sql, params = []) {
      const r = raw.run(sql, params as never);
      return { changes: r.changes, lastID: Number(r.lastInsertRowid) };
    },
    async exec(sql) { raw.exec(sql); },
    raw,
  };
}
```

**Migration steps:**
1. Add the adapter, keep `getDb()` returning `DbClient` (same signature as today).
2. Replace `app/db.server.ts` internals only — all 38 consumer files compile unchanged.
3. **Fix the two `lastID` sites** (`app/db.server.ts:262,265` and `app/routes/api/folders/route.ts:88`) — the shim keeps the name `lastID`, so these need no change if the shim maps it. ✅
4. Delete `sqlite` + `sqlite3` from `package.json`, run `bun install`.
5. Verify: `bun test` + `bun run lint`.

### 4.3 Transactions

`withTransaction` (`app/lib/db/transaction.server.ts`) currently serializes with a promise chain because the shared connection cannot nest `BEGIN`. With sync SQLite, replace it with a plain synchronous block:

```ts
export function withTransaction<T>(db: DbClient, fn: () => T): T {
  db.raw.exec('BEGIN');
  try { const r = fn(); db.raw.exec('COMMIT'); return r; }
  catch (e) { db.raw.exec('ROLLBACK'); throw e; }
}
```

Only **one** caller today (`api/sessions/$sessionId.queue.ts`), so this is a small, safe change.

### 4.4 Exit criteria
- [ ] `sqlite` and `sqlite3` removed from `package.json`
- [ ] `bun run lint` clean
- [ ] `bun test` green (7 test files)
- [ ] App boots under Bun, all 64 API endpoints return identical payloads (diff against a recorded baseline)

---

## 5. Phase 2 — Elysia server (replace `app/routes/api/**` + `server/`)

### 5.1 Route conversion rules

Every Remix route file maps to exactly one Elysia handler. The mechanical translation:

| Remix | Elysia |
|---|---|
| `export async function loader({request})` | `.get('/path', ({ query, request }) => ...)` |
| `export async function action({request})` | `.post('/path', ({ body, request }) => ...)` |
| `action` with `request.method` switch | Split into `.post()`, `.put()`, `.delete()` — **do this, don't branch** |
| `json(data, {status: 500})` | `status(500, data)` or throw a typed error |
| `params.sessionId` | `params: t.Object({ sessionId: t.String() })` |
| `new Response(stream, {headers})` | `sse(generator)` or return a `ReadableStream` |
| `LoaderFunctionArgs` / `ActionFunctionArgs` | `Context` from Elysia |

**Route group example** (`app/routes/api/settings/route.ts` → `src/server/routes/settings/index.ts`):

```ts
import { Elysia, t } from 'elysia';
import { getDb } from '@/server/lib/db/client';
import { isMockMode } from '@/server/lib/mock';

export const settingsRoutes = new Elysia({ prefix: '/api/settings' })
  .get('/', async () => {
    const db = await getDb();
    const rows = await db.all<{ key: string; value: string }>('SELECT * FROM app_settings');
    const settings: Record<string, unknown> = {};
    for (const row of rows) {
      try { settings[row.key] = JSON.parse(row.value); }
      catch { settings[row.key] = row.value; }
    }
    return { settings, isMock: isMockMode() };
  })
  .post('/', async ({ body, status }) => {
    const db = await getDb();
    for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
      await db.run(
        'INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)',
        [key, typeof value === 'object' ? JSON.stringify(value) : String(value)],
      );
    }
    return { success: true };
  }, {
    body: t.Record(t.String(), t.Unknown()),
  });
```

> **Note:** Elysia's default error shape is `{ name, message, status }`. The current app returns `{ error: string, code?: string }` from ~200 sites. To keep the client unchanged, add a global `onError` that remaps to the legacy envelope (§5.5), or update the client error readers in one pass. **Recommendation: remap on the server.** Zero client churn.

### 5.1.1 Route file → module mapping

Every current route file lands in a domain folder. This is the full 66-file mapping — nothing is dropped, nothing stays flat:

| Current (`app/routes/`) | Target (`src/server/routes/`) |
|---|---|
| `_index.tsx` | → `src/client/App.tsx` + `src/ssr/entry-server.tsx` (not a route) |
| `$.tsx` | → `ssr/index.ts` catch-all + `well-known/devtools.ts` |
| `api/health.ts` | `health/index.ts` |
| `api/agent/$sessionId.ts` | `agent/index.ts` (POST cmd) + `agent/command.ts` |
| `api/agent/$sessionId.events.ts` | `agent/events.ts` |
| `api/agent/new.ts` | `agent/new.ts` |
| `api/agent/prewarm.ts` | `agent/prewarm.ts` |
| — (new) | `agent/ws.ts` (extracted from `server/agent-stream-websocket.js`) |
| `api/chat/route.ts` | `chat/index.ts` |
| `api/chat/$sessionId.ts` | `chat/session.ts` |
| `api/chat/$sessionId.rewind.ts` | `chat/rewind.ts` |
| `api/chat/stream.ts` | `chat/stream.ts` |
| `api/sessions/list.ts` | `sessions/index.ts` |
| `api/sessions/$folderId.ts` | `sessions/folder.ts` |
| `api/sessions/$sessionId.archive.ts` | `sessions/session.ts` |
| `api/sessions/$sessionId.rename.ts` | `sessions/session.ts` |
| `api/sessions/$sessionId.state.ts` | `sessions/session.ts` |
| `api/sessions/$sessionId.queue.ts` | `sessions/session.ts` |
| `api/sessions/$sessionId.stream-seen.ts` | `sessions/session.ts` |
| `api/sessions/$sessionId.subagents.ts` | `sessions/subagents.ts` |
| `api/sessions/$sessionId.subagents.$subagentId.ts` | `sessions/subagents.ts` |
| `api/settings/route.ts` | `settings/index.ts` |
| `api/settings/agents.ts` | `settings/agents.ts` |
| `api/settings/behavior.ts` | `settings/behavior.ts` |
| `api/settings/commands.ts` | `settings/commands.ts` |
| `api/settings/mcp.ts` | `settings/mcp.ts` |
| `api/settings/mcp-test.ts` | `settings/mcp-test.ts` |
| `api/settings/omp-config.ts` | `settings/omp-config.ts` |
| `api/settings/projects.ts` | `settings/projects.ts` |
| `api/settings/provider-models.ts` | `settings/provider-models.ts` |
| `api/settings/providers.ts` | `settings/providers.ts` |
| `api/settings/skills.ts` | `settings/skills.ts` |
| `api/settings/usage.ts` | `settings/usage.ts` |
| `api/fs/action.ts` | `fs/action.ts` |
| `api/fs/browse.ts` | `fs/index.ts` |
| `api/fs/dir.ts` | `fs/index.ts` |
| `api/fs/list.ts` | `fs/index.ts` |
| `api/fs/read.ts` | `fs/index.ts` |
| `api/fs/git.ts` | `fs/git.ts` |
| `api/fs/replace.ts` | `fs/replace.ts` |
| `api/fs/search.ts` | `fs/search.ts` |
| `api/fs/validate.ts` | `fs/validate.ts` |
| `api/folders/route.ts` | `folders/index.ts` |
| `api/folders/$folderId.pin.ts` | `folders/folder.ts` |
| `api/folders/$folderId.toggle.ts` | `folders/folder.ts` |
| `api/folders/$folderId.delete.ts` | `folders/folder.ts` |
| `api/folders/$folderId.settings.ts` | `folders/folder.ts` |
| `api/files/$sessionId.ts` | `files/index.ts` |
| `api/files/$fileId.toggle.ts` | `files/toggle.ts` |
| `api/telemetry/context.ts` | `telemetry/context.ts` |
| `api/telemetry/tokens.ts` | `telemetry/tokens.ts` |
| `api/telemetry/raw-messages.ts` | `telemetry/raw-messages.ts` |
| `api/terminal/run.ts` | `terminal/run.ts` |
| `api/terminal/stream.ts` | `terminal/stream.ts` |
| `api/browser/$sessionId.stream.ts` | `browser/stream.ts` |
| `api/models/route.ts` | `models/index.ts` |
| `api/model-roles/route.ts` | `models/roles.ts` |
| `api/omp/state.ts` | `omp/index.ts` |
| `api/omp/sidebar.ts` | `omp/index.ts` |
| `api/omp/session-stats.ts` | `omp/index.ts` |
| `api/omp/commands.ts` | `omp/commands.ts` |
| `api/omp/extensions.ts` | `omp/extensions.ts` |
| `api/omp/login.ts` | `omp/login.ts` |
| `api/omp/plugins.ts` | `omp/plugins.ts` |
| `api/omp/pricing.ts` | `omp/pricing.ts` |
| `api/updates/apply.ts` | `updates/apply.ts` |
| `api/updates/check.ts` | `updates/check.ts` |

**Notable merges** (Remix flat-route suffixes → one Elysia module with distinct methods/paths):

| Target module | Absorbs | Why one file |
|---|---|---|
| `sessions/session.ts` | `archive`, `rename`, `state`, `queue`, `stream-seen` | 5 one-method endpoints on the same `:sessionId` resource — one `Elysia` instance, five `.post()`/`.get()` chains. Splitting them would create five files under 90 lines each. |
| `folders/folder.ts` | `pin`, `toggle`, `delete`, `settings` | Same shape: 4 mutations on `:folderId`. |
| `fs/index.ts` | `browse`, `dir`, `list`, `read` | 4 read-only listings; `dir`/`list`/`browse` differ only in depth and filtering. |
| `omp/index.ts` | `state`, `sidebar`, `session-stats` | 3 independent read-only probes, each ~30 lines. |
| `agent/index.ts` | `$sessionId` GET + POST | The GET (state) and POST (command) share session resolution and error mapping — keeping them together avoids re-deriving the same `resolveSessionPathOr404()` helper. |

> **Ceiling check:** the largest resulting modules are `settings/mcp.ts` (284 lines today), `fs/git.ts` (328), `models/index.ts` (331), `chat/session.ts` (338). All four are under the 350-line cap **as-is** — but `fs/git.ts` and `chat/session.ts` have under 25 lines of headroom. Split them the moment they grow, per `AGENTS.md` §1.

### 5.2 WebSocket — `GET /api/agent/:sessionId/ws`

This is a **direct port** of `server/agent-stream-websocket.js` (210 lines) into an Elysia `.ws()` route. The transport policy must be preserved exactly:

| Current behavior | Elysia equivalent |
|---|---|
| `ws` library + `noServer` upgrade on path regex | `.ws('/api/agent/:sessionId/ws', {...})` |
| `rejectUpgrade(socket, 409, ...)` when session unknown | `beforeHandle` returning `status(409, ...)` — Elysia refuses the upgrade |
| `connected` frame on open | `open(ws) { ws.send({type:'connected', sessionId}) }` |
| `socket.ping()` every 30s, teardown on missed pong | `ws.raw.ping()` — Bun exposes `ping`/`pong` on the raw socket |
| `socket.bufferedAmount > 256KB` → hold `message_update` | `ws.raw.bufferedAmount` — Bun exposes the same property |
| `socket.on('close'|'error')` teardown | `close(ws)` + try/catch around `ws.send` |
| Reads `globalThis.__ompSessions` | **unchanged** — registry stays on `globalThis` |

```ts
// src/server/routes/agent/ws.ts  — child of the agent domain plugin
import { Elysia, t } from 'elysia';
import { getRpcSession } from '@/server/lib/omp/rpc/session-registry';

const HIGH_WATER_BYTES = 256 * 1024;
const FLUSH_DELAY_MS = 50;

// Bare path: the `/api/agent` prefix is declared once on the parent domain plugin.
export const agentWsRoutes = new Elysia()
  .ws('/:sessionId/ws', {
    params: t.Object({ sessionId: t.String() }),

    beforeHandle({ params, status }) {
      const session = getRpcSession(params.sessionId);
      if (!session?.isAlive()) {
        return status(409, 'Session is not managed by the chamber');
      }
    },

    open(ws) {
      const { sessionId } = ws.data.params;
      const session = getRpcSession(sessionId)!;

      let pendingUpdate: unknown = null;
      let flushTimer: ReturnType<typeof setTimeout> | null = null;
      let closed = false;

      const flush = () => {
        if (flushTimer !== null) { clearTimeout(flushTimer); flushTimer = null; }
        const data = pendingUpdate; pendingUpdate = null;
        if (data === null || closed) return;
        try { ws.send(JSON.stringify(data)); } catch { teardown(); }
      };

      const send = (data: unknown) => {
        if (closed) return;
        const type = (data as { type?: string } | null)?.type;
        if (type === 'message_update' && (ws.raw as any).bufferedAmount > HIGH_WATER_BYTES) {
          pendingUpdate = data;
          if (flushTimer === null) flushTimer = setTimeout(flush, FLUSH_DELAY_MS);
          return;
        }
        flush();
        try { ws.send(JSON.stringify(data)); } catch { teardown(); }
      };

      const unsubscribe = session.onEvent(send);
      function teardown() {
        if (closed) return;
        closed = true;
        if (flushTimer !== null) clearTimeout(flushTimer);
        try { unsubscribe(); } catch {}
      }

      (ws.data as any).__teardown = teardown;
      ws.send(JSON.stringify({ type: 'connected', sessionId }));
    },

    message() { /* observer-only */ },

    close(ws) { (ws.data as any).__teardown?.(); },
  });
```

**Keepalive:** Bun's native WebSocket does **not** auto-ping. Add a `setInterval` per connection in `open()` that calls `(ws.raw as any).ping()` and tracks a pong deadline — or accept that browsers keep the socket warm via TCP and rely on client-side re-dial (the client already reconnects with capped backoff in `app/lib/chat/omp/socket.ts`). **Recommendation: implement the ping explicitly; the current code's 30s heartbeat exists for a reason (proxies).**

### 5.3 SSE — `GET /api/agent/:sessionId/events` and 4 more stream routes

Five routes return `text/event-stream`, spread across three domain folders:

| Route | Module | Purpose |
|---|---|---|
| `api/agent/$sessionId.events.ts` | `agent/events.ts` | agent event stream (fallback transport) |
| `api/chat/stream.ts` | `chat/stream.ts` | MOCK-only Gemini/simulated streaming |
| `api/terminal/stream.ts` | `terminal/stream.ts` | shell command output |
| `api/browser/$sessionId.stream.ts` | `browser/stream.ts` | CDP screencast frames |
| `api/omp/login.ts` | `omp/login.ts` | omp login flow output |

Elysia's `sse()` helper covers the simple cases:

```ts
// src/server/routes/terminal/stream.ts — bare path, parent prefix is /api/terminal
import { Elysia, sse } from 'elysia';

export const terminalStreamRoutes = new Elysia()
  .get('/stream', function* ({ query }) {
    yield sse({ event: 'start', data: { cwd: '.' } });
    // ...spawn + yield output chunks...
    yield sse({ event: 'exit', data: { exitCode: 0 } });
  });
```

**But the agent event stream needs the manual `ReadableStream` path** — `sse()` does not give you backpressure (`desiredSize`) or the coalescing timer. Port `$sessionId.events.ts` almost verbatim into `src/server/routes/agent/events.ts`; only the `Response` construction changes:

```ts
// src/server/routes/agent/events.ts
export const agentEventsRoutes = new Elysia()
  .get('/:sessionId/events', ({ params, request, status }) => {
    const session = getRpcSession(params.sessionId);
    if (!session?.isAlive()) return status(409, 'Session is not managed by the chamber');

    // ...the existing ReadableStream body from $sessionId.events.ts, unchanged...
    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  });
```

### 5.4 Compression — the SSE trap

The current Express entry has an explicit filter:

```js
const shouldCompress = (req, res) => {
  const ct = res.getHeader('Content-Type');
  if (typeof ct === 'string' && ct.includes('text/event-stream')) return false;
  return compression.filter(req, res);
};
```

**This must be preserved.** `elysia-compress` defaults to `compressStream: false`, which is correct — but verify it, because the comment in `server/index.js` explains exactly why: *"zlib holds small frames until its buffer fills, so the SSE transports would deliver nothing until the stream ends."*

If you hand-roll a `mapResponse` compression hook instead, guard it:

```ts
.mapResponse(async ({ set, response }) => {
  const ct = set.headers['content-type'];
  if (typeof ct === 'string' && ct.includes('text/event-stream')) return; // never compress SSE
  // ...
});
```

### 5.5 Global error envelope

Every route currently returns `{ error: message }` or `{ error, code }`. Add one `onError` to keep clients working:

```ts
new Elysia()
  .onError(({ code, error, status, set }) => {
    if (code === 'VALIDATION') return status(400, { error: 'Invalid request', code: 'validation_error' });
    if (code === 'NOT_FOUND') return status(404, { error: 'Not found' });
    const message = error instanceof Error ? error.message : String(error);
    return status(typeof (error as any)?.status === 'number' ? (error as any).status : 500, { error: message });
  });
```

Then port `commandErrorResponse()` from `api/agent/$sessionId.ts` into a typed `WebRpcError` class registered with `.error({...})`.

### 5.6 Static + SPA fallback

```ts
import { staticPlugin } from '@elysiajs/static';

new Elysia()
  // Hashed assets — immutable, 1 year (matches the Express config)
  .use(await staticPlugin({
    assets: 'dist/client',
    prefix: '/assets',
    maxAge: 31536000,
    directive: 'public, immutable',
    alwaysStatic: false,   // wildcard route for anything beyond staticLimit
  }))
  // public/ — 1 hour (matches the Express config)
  .use(await staticPlugin({
    assets: 'public',
    prefix: '/',
    maxAge: 3600,
    directive: 'public',
  }))
```

**SPA fallback:** `@elysiajs/static` supports `indexHTML: true`, which serves `index.html` for any request matching neither a route nor a static file. Since OMPChamber is a single-page app with `?sessionId=` query routing, this is exactly what you need — **but only in production**. In dev, Rsbuild's middleware owns the HTML.

### 5.7 Production entry

```ts
// src/server/index.ts
import { Elysia } from 'elysia';
import { apiRoutes } from '@/server/routes';
import { compressPlugin } from '@/server/plugins/compress';
import { staticPluginAssets, staticPluginPublic } from '@/server/plugins/static';
import { ssrRoutes } from '@/server/plugins/ssr';

const port = Number(process.env.PORT) || 3000;
const host = process.env.HOST || 'localhost';

const app = new Elysia()
  .use(compressPlugin)
  .use(staticPluginAssets)
  .use(staticPluginPublic)
  .use(apiRoutes)        // every domain plugin — including agent/ws.ts
  .use(ssrRoutes)        // Preact SSR + index.html fallback
  .listen({ port, hostname: host });

console.log(`[ompchamber] listening on http://${host}:${port}`);

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, () => {
    app.stop();
    process.exit(0);
  });
}
```

> **The WebSocket is not special-cased anymore.** `agent/ws.ts` is composed inside `apiRoutes` like every other domain module — Elysia routes the upgrade on the same port. This is the whole reason the migration removes the Express entry: `server/index.js` exists today only because `remix-serve` "exposes no upgrade hook".

> **Graceful shutdown matters here.** The current `server/index.js` calls `server.close()`, and `session-registry.ts` already hooks `SIGINT`/`SIGTERM` to `destroy()` every omp child. Keep that: Elysia's `app.stop()` closes the listener, then the registry's existing handlers reap the spawned omp processes. Do not add a second shutdown path that races it.

### 5.8 CLI update (`bin/lib/runtime.js`)

`buildServeInvocation()` currently resolves `@remix-run/dev` for dev and `server/index.js` for prod. New:

```js
export function buildServeInvocation({ pkgRoot, mode, port, host }) {
  const entry = path.join(pkgRoot, 'src', 'server', 'index.ts');
  if (mode === 'prod') {
    return {
      file: process.execPath,                       // bun
      args: [path.join(pkgRoot, 'dist', 'server', 'index.js')],
      env: { ...process.env, NODE_ENV: 'production', PORT: String(port), HOST: host },
    };
  }
  return {
    file: process.execPath,                         // bun
    args: [entry],                                  // Bun runs TS directly — no tsx, no remix CLI
    env: { ...process.env, NODE_ENV: 'development', PORT: String(port), HOST: host },
  };
}
```

This is a **net simplification**: one entry file for both modes, no `resolveRemixBin()`.

### 5.9 Exit criteria
- [ ] All 64 endpoints respond with byte-identical JSON (record baselines before starting)
- [ ] WS + SSE agent streams both deliver `connected` → `message_update` → terminal frames
- [ ] `409` on unmanaged session for both transports
- [ ] Compression active on JSON, **inactive** on `text/event-stream`
- [ ] `ompchamber serve/stop/restart/status/logs` all work against the new entry
- [ ] SIGTERM reaps every spawned omp child (verify with `ps`)

---

## 6. Phase 3 — Rsbuild

### 6.1 Two environments (client + SSR)

Rsbuild 2.x multi-environment is the supported path (verified: `rsbuild.createDevServer()` + `environments.{web,node}.loadBundle()` / `getTransformedHtml()`).

```ts
// rsbuild.config.ts
import { defineConfig } from '@rsbuild/core';
import { pluginPreact } from '@rsbuild/plugin-preact';

const isDev = process.env.NODE_ENV !== 'production';

export default defineConfig({
  plugins: [pluginPreact()],   // aliases react/react-dom → preact/compat, enables prefresh HMR

  environments: {
    web: {
      source: {
        entry: { index: './src/client/main.tsx' },
      },
      output: { target: 'web', distPath: { root: 'dist/client' } },
      html: { template: './index.html' },
      server: { publicDir: { name: 'public' } },   // copies icons/manifest/sw.js
    },
    node: {
      source: { entry: { index: './src/ssr/entry-server.tsx' } },
      output: {
        target: 'node',
        distPath: { root: 'dist/server' },
        module: true,            // v2 default for node target — ESM
      },
      tools: { htmlPlugin: false },   // no HTML for the SSR bundle
    },
  },

  resolve: { alias: { '@': './src' } },
  source: { define: { 'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV) } },
  splitChunks: {              // v2 syntax — performance.chunkSplit is deprecated
    cacheGroups: {
      katex:    { test: /node_modules[\\/]katex/,   name: 'katex-vendor',    chunks: 'all', enforce: true },
      markdown: { test: /node_modules[\\/](remend|marked)/, name: 'markdown-vendor', chunks: 'all', enforce: true },
      prism:    { test: /node_modules[\\/]prismjs/, name: 'prism-vendor',    chunks: 'all', enforce: true },
    },
  },
  server: { port: 3000, host: '0.0.0.0' },
});
```

> **Rsbuild 2.0 gotchas that bite this repo:**
> - `server.host` default changed from `0.0.0.0` → `localhost`. Set it explicitly (the CLI supports `--lan`).
> - `source.alias` **removed** → use `resolve.alias`.
> - `performance.chunkSplit` deprecated → use `splitChunks` (as above).
> - Node target now defaults to ESM + no minify. That is what you want here.
> - `dev.setupMiddlewares` deprecated → `server.setup`.

### 6.2 Tailwind v4

```ts
// postcss.config.mjs  (or tools.postcss in rsbuild.config.ts)
export default { plugins: { '@tailwindcss/postcss': {} } };
```

`app/tailwind.css` stays byte-identical — it uses `@import "tailwindcss"` + `@theme` + `@plugin "@tailwindcss/typography"`, all v4-native. **No changes to the design system.**

> ⚠️ `@import "@xterm/xterm/css/xterm.css"` is inside `tailwind.css`. Rsbuild resolves bare-specifier CSS imports through PostCSS, which historically differs from Vite. Verify the xterm styles land; if not, move that import to `src/client/main.tsx` as a side-effect import.

### 6.3 HTML template (replaces `app/root.tsx`)

```html
<!-- index.html -->
<!doctype html>
<html lang="en" data-theme="<%= htmlWebpackPlugin.options.theme ?? 'paper' %>">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <meta name="theme-color" content="#faf8f3" />
    <meta name="mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-title" content="OMPChamber" />
    <link rel="manifest" href="/manifest.webmanifest" />
    <link rel="icon" type="image/svg+xml" href="/icon.svg" sizes="any" />
    <link rel="icon" type="image/png" href="/icon-192x192.png" sizes="192x192" />
    <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
    <title>OMPChamber</title>
    <!--app-head-->
  </head>
  <body>
    <div id="app"><!--app-content--></div>
    <script type="module" src="/src/client/main.tsx"></script>
    <script>
      if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
          navigator.serviceWorker.register('/sw.js').catch(() => {});
        });
      }
    </script>
  </body>
</html>
```

`<!--app-content-->` is replaced by the SSR output; `<!--app-head-->` by the theme `<meta theme-color>` tag. This is a direct port of `root.tsx`'s `Layout` + `links()` + `Meta()`.

### 6.4 Dev server integration (the one new thing to build)

Rsbuild exposes `createDevServer()` with a `middlewares` connect stack. Elysia does not consume connect middleware — so mount the Rsbuild middleware into a `fetch` handler and let Elysia `.mount()` it:

```ts
// src/server/dev.ts  (dev only)
import { createRsbuild, loadConfig } from '@rsbuild/core';
import { Elysia } from 'elysia';

export async function attachRsbuildDev(app: Elysia) {
  const { content } = await loadConfig();
  const rsbuild = await createRsbuild({ config: content });
  const devServer = await rsbuild.createDevServer();

  // Rsbuild's connect middlewares → a WinterCG fetch handler
  const handler = (request: Request) =>
    new Promise<Response>((resolve, reject) => {
      const chunks: Uint8Array[] = [];
      const req = {
        url: new URL(request.url).pathname + new URL(request.url).search,
        method: request.method,
        headers: Object.fromEntries(request.headers),
        on: () => {}, read: () => {},
      } as any;
      const res = {
        statusCode: 200,
        headers: {} as Record<string, string>,
        setHeader(k: string, v: string) { this.headers[k] = v; },
        write(chunk: Uint8Array) { chunks.push(chunk); return true; },
        end(chunk?: Uint8Array) {
          if (chunk) chunks.push(chunk);
          resolve(new Response(Buffer.concat(chunks as any), {
            status: this.statusCode, headers: this.headers,
          }));
        },
      } as any;
      try { devServer.middlewares(req, res, (err?: unknown) => err ? reject(err) : resolve(new Response('Not found', { status: 404 }))); }
      catch (e) { reject(e); }
    });

  app.mount(handler);
  await devServer.listen();
  return devServer;
}
```

> **This adapter is ~40 lines of glue and is the highest-uncertainty part of the plan.** If `@rsbuild/core` exposes a `devServer.environments.web.context` or a documented connect→fetch bridge, prefer it. Budget half a day to spike this and **verify HMR + the WebSocket upgrade coexist on one port** before committing to the architecture. If they conflict, the fallback is: run Rsbuild on `:3001` and proxy `/` from Elysia in dev (with `server.proxy` in Rsbuild pointed the other way for `/api`).

### 6.5 Exit criteria
- [ ] `bun run build` produces `dist/client` + `dist/server`
- [ ] Bundle sizes ≤ current Vite output (check `katex-vendor`, `markdown-vendor`, `prism-vendor` split correctly)
- [ ] HMR works for `.tsx` and `.css`
- [ ] One port serves API + assets + HMR + agent WebSocket in dev
- [ ] `public/` assets (icons, manifest, sw.js) served in both modes

---

## 7. Phase 4 — Preact

### 7.1 The compat alias

`@rsbuild/plugin-preact` sets these automatically (`reactAliasesEnabled: true` by default). If you ever need them manually:

| Import specifier | Alias target |
|---|---|
| `react` | `preact/compat` |
| `react-dom` | `preact/compat` |
| `react-dom/client` | `preact/compat/client` |
| `react-dom/test-utils` | `preact/test-utils` |
| `react/jsx-runtime` | `preact/jsx-runtime` |
| `react/jsx-dev-runtime` | `preact/jsx-dev-runtime` |

**Order matters** if hand-writing: list `react-dom/test-utils` **before** `react-dom`, or the broader rule shadows it.

**TypeScript:** map `paths` in `tsconfig.json` and keep `skipLibCheck: true` (a few React-typed deps ship `.d.ts` that Preact does not satisfy). Set `"jsx": "react-jsx"`, `"jsxImportSource": "preact"`.

### 7.2 SSR

`preact-render-to-string@6.7` supports **both** streaming and sync:

```tsx
// src/ssr/entry-server.tsx
import { renderToStringAsync } from 'preact-render-to-string';
import { App } from '@/client/App';

export async function render(url: string, theme: string) {
  const html = await renderToStringAsync(<App url={url} initialTheme={theme} />);
  return { html, theme };
}
```

Streaming (`renderToReadableStream` / `renderToPipeableStream`) is available and marked "early" upstream. **Recommendation: start with `renderToStringAsync`.** The current `_index.tsx` loader is explicitly "deliberately cheap" — settings + a UA check — so there is nothing to stream. Revisit only if the SSR shell grows.

### 7.3 What actually needs rewriting

| Concern | Work |
|---|---|
| **`useSearchParams`** (9 files) | Write `src/client/lib/router/search-params.ts` — a ~40 LOC `useSyncExternalStore` over `popstate` + `history.pushState`. **API-identical**, so zero call-site edits. |
| **`useFetcher`** (7 files) | Write `useApiQuery` / `useApiMutation` hooks backed by plain `fetch`. The 7 call sites need small edits (`fetcher.submit(fd, {method, action})` → `mutate(fd)`). |
| **`useLoaderData`** (2 files) | `root.tsx` disappears; `_index.tsx`'s `appSettings` + `initialIsMobile` move into `App.tsx` props (SSR-injected) and a settings context. |
| **`Link`** | Zero real uses. Skip. |
| **`createPortal`** (3 files) | `preact/compat` exports it. No change. |
| **`forwardRef`** (1 file: `RealtimeXtermView.tsx`) | `preact/compat` supports it. No change. |
| **`React.lazy` + `Suspense`** (10 + 15 uses) | `preact/compat` supports both. `lazy-panels.tsx` works unchanged. |
| **`import React from 'react'`** (16 files) | Remove — Preact's JSX transform does not need it (and `AGENTS.md` already forbids it). |
| **`motion/react`** (1 file) | **Rewrite.** See §7.4. |
| **`lucide-react`** (162 files) | Mechanical: one `sed` on the import specifier → `lucide-preact`. Icon names are identical. **Largest file count, smallest risk.** |
| **`react-resizable-panels`** (3 files) | Keep via compat. **Test first.** |
| **`react-icons`** (1 file) | Keep via compat. |

### 7.4 The one hard rewrite: `motion`

`app/components/workspace/chat-timeline/tool-renderers/ask-dialog/index.tsx` uses `motion` + `AnimatePresence` for dialog enter/exit. `motion` is **not Preact-compatible** (maintainer: *"Sorry Preact isn't supported! Any time it's worked has been accidental."*). Replace with:

```css
/* CSS-only enter/exit — no runtime */
.ask-dialog {
  opacity: 0; transform: translateY(4px);
  transition: opacity 160ms ease, transform 160ms ease;
  transition-behavior: allow-discrete;
  @starting-style { opacity: 0; transform: translateY(4px); }
}
.ask-dialog[data-open='true'] { opacity: 1; transform: none; }
```

Exit animation needs the dialog to stay mounted until the transition ends — either use `onTransitionEnd` + a `data-closing` attribute, or drop the exit animation (a 160 ms fade-out on a modal is not load-bearing). **Recommendation: drop exit animation, keep enter.** It is 20 lines of CSS versus a library swap.

### 7.5 Signals — optional, not required

`@preact/signals` would help the chat stream (high-frequency `message_update` frames) avoid re-rendering the whole timeline. But the current code already solves this with explicit coalescing (`stream-raf.ts`, `revalidation-throttle.ts`) and refs. **Do not introduce signals in this migration.** Add them later, surgically, if profiling demands it. Mixing signals and `useState` mid-migration creates two sources of truth.

### 7.6 Exit criteria
- [ ] All 229 components render under Preact with zero console errors
- [ ] `react-resizable-panels` drag/resize works, and `WorkspacePanels`' `setLayout` pixel restore still works (this is the trickiest layout behavior — `AGENTS.md` §9)
- [ ] `createPortal` modals (Toast, Modals, AttachmentChips) position correctly
- [ ] Terminal (`@xterm/xterm` dynamic import) mounts and resizes
- [ ] Mermaid + KaTeX + Prism render in the timeline
- [ ] Bundle size drop measured and recorded

---

## 8. Phase 5 — Routing & SSR shell

### 8.1 The "router" is 3 things

1. **`?sessionId=` query param** — read by `_index.tsx`, `LayoutWrapper`, `chat-timeline`, `session-sidebar`. The `useSearchParams` shim covers all of it.
2. **`.well-known/appspecific/com.chrome.devtools.json`** — a 1-line route returning `{}` so the devtools probe does not 404 (`app/routes/$.tsx`).
3. **404 for everything else.**

There is **no multi-page navigation**. The app never calls `useNavigate` or `history.pushState` outside `setSearchParams`. So:

```ts
// src/server/routes/well-known/devtools.ts
import { Elysia } from 'elysia';

// Bare path — the parent domain plugin owns the /.well-known/appspecific prefix.
export const wellKnownDevtoolsRoutes = new Elysia()
  .get('/com.chrome.devtools.json', () => ({}));
```

```ts
// src/server/routes/well-known/index.ts
import { Elysia } from 'elysia';
import { wellKnownDevtoolsRoutes } from '@/server/routes/well-known/devtools';

export const wellKnownRoutes = new Elysia({ prefix: '/.well-known/appspecific' })
  .use(wellKnownDevtoolsRoutes);
```

...plus the `ssrRoutes` catch-all (§8.2) that renders `<App/>` and lets `indexHTML: true` handle the static fallback. **Done.**

### 8.2 SSR handler

```ts
// src/server/plugins/ssr.ts
import { Elysia } from 'elysia';
import { getDb } from '@/server/lib/db/client';
import { isMockMode } from '@/server/lib/mock';

export const ssrRoutes = new Elysia().get('*', async ({ request, set }) => {
  const url = new URL(request.url);
  if (url.pathname.startsWith('/api/')) return new Response('Not found', { status: 404 });

  const db = await getDb();
  const row = await db.get<{ value: string }>(
    'SELECT * FROM app_settings WHERE key = ?', ['omp_chamber_settings'],
  );
  let theme = 'paper';
  try { theme = JSON.parse(row?.value ?? '{}').theme ?? 'paper'; } catch {}

  const ua = request.headers.get('user-agent') ?? '';
  const initialIsMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile|mobile|CriOS/i.test(ua);

  const { html } = await render(url.pathname, theme);
  const template = await readFile('dist/client/index.html', 'utf8');
  set.headers['content-type'] = 'text/html; charset=utf-8';
  return template
    .replace('<html lang="en" data-theme="paper"', `<html lang="en" data-theme="${theme}"`)
    .replace('<!--app-content-->', html)
    .replace('<!--app-head-->', `<meta name="theme-color" content="${theme === 'one-dark-pro-soft' ? '#282c34' : '#faf8f3'}">`);
});
```

> **Why read `index.html` from disk?** Rsbuild's `environments.web.getTransformedHtml('index')` is the dev-friendly way, but it is a build-time API. In production, reading `dist/client/index.html` once at boot (and caching it) is simpler and avoids a second Rsbuild handle in the prod process. Cache it in a module-level variable.

### 8.3 Hydration

```tsx
// src/client/main.tsx
import { hydrate } from 'preact';
import { App } from '@/client/App';
import '@/tailwind.css';
import 'katex/dist/katex.min.css';
import '@fontsource/fira-code/400.css';
// ...500/600/700

hydrate(<App />, document.getElementById('app')!);
```

The `data-theme` attribute is already on `<html>` from SSR; `useTheme` (`app/hooks/ui/theme.ts`) reads it via `MutationObserver` — **that hook needs zero changes**.

---

## 9. Phase 6 — Packaging & polish

### 9.1 `package.json` (target)

```json
{
  "type": "module",
  "scripts": {
    "dev": "bun run --watch src/server/index.ts",
    "build": "rsbuild build",
    "start": "NODE_ENV=production bun dist/server/index.js",
    "lint": "tsc --noEmit",
    "test": "bun test"
  }
}
```

Note: `tsc --noEmit` stays as the typechecker. Rsbuild does not typecheck (Rspack strips types), so `tsc` remains the gate — which is exactly what `AGENTS.md` §8 requires.

### 9.2 Optional: single-file binary

```bash
bun build --compile --minify --sourcemap src/cli/ompchamber.ts --outfile ompchamber
```

**Caveat:** `@rsbuild/core` and `@tailwindcss/postcss` are build-time only and must not be pulled into the runtime graph. Keep `src/server/` free of build-tool imports — the dev-only Rsbuild adapter (§6.4) must be a dynamic `import()` behind `if (isDev)`.

**Second caveat:** `omp` itself is still spawned as an external binary (`app/lib/omp/core/cli.ts` probes `PATH`, `~/.bun/bin`, `/opt/homebrew/bin`, `/usr/local/bin`). Compiling the chamber does not embed the agent. That is correct and should stay.

### 9.3 PWA

`public/sw.js` + `public/manifest.webmanifest` are hand-written and framework-agnostic. `vite-plugin-pwa` was never actually wired (no `VitePWA` call anywhere) — just delete the dependency. Rsbuild copies `public/` via `server.publicDir`. **No work.**

---

## 10. Risk register

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| 1 | `motion` breaks under Preact | **Certain** | Low (1 file) | Rewrite as CSS transitions (§7.4) |
| 2 | `react-resizable-panels` misbehaves under compat | Medium | **High** (core layout) | Spike in Phase 4 day 1. Fallback: ~150 LOC custom splitter; pixel-width logic already exists in `panel-widths.ts` |
| 3 | Rsbuild dev middleware + Elysia `.ws()` on one port | Medium | **High** (dev experience) | Spike before Phase 3 commitment (§6.4). Fallback: two ports + proxy |
| 4 | `bun:sqlite` sync API subtly changes concurrency behavior | Low | Medium | The app already serializes with `withTransaction`; sync makes it *safer*. Verify the queue route |
| 5 | Elysia `.ws()` lacks `bufferedAmount` on `ws.raw` | Low | Medium | Verify in spike; if absent, fall back to a `sending` flag + `drain()` callback (Elysia exposes `drain`) |
| 6 | Preact SSR + `preact-render-to-string` streaming is "early" | Low | Low | Use `renderToStringAsync` — nothing needs streaming here |
| 7 | Type friction: React-typed deps vs Preact types | **Certain** | Low | `skipLibCheck: true` (already set) + `paths` mapping |
| 8 | Bundle-size regression from `preact/compat` aliasing | Low | Low | compat adds ~1 kB; net win is still ~40 kB |
| 9 | 164 DB call sites miss a behavioral edge (e.g. `INSERT OR REPLACE` semantics) | Medium | Medium | Adapter shim keeps call sites identical; baseline-diff every endpoint |
| 10 | `globalThis.__ompSessions` registry desyncs across module graphs | Low | **High** (agent dies silently) | Keep the registry on `globalThis` (it already is). Never move it into an Elysia plugin scope |

---

## 11. Sequencing & effort

```
Phase 1  Bun SQLite ──────────────┐  standalone, no framework change
                                   │
Phase 2  Elysia server ────────────┤  API parity gate ──┐
                                   │                     │
Phase 3  Rsbuild ──────────────────┤  build parity gate ─┤
                                   │                     │
Phase 4  Preact ───────────────────┤  render parity gate ─┤
                                   │                     │
Phase 5  Routing / SSR shell ──────┤  route parity gate ──┤
                                   │                     │
Phase 6  Packaging ────────────────┘  ship
```

| Phase | Effort | Blocks |
|---|---|---|
| 1. Bun SQLite | 1–2 days | nothing |
| 2. Elysia (64 routes + WS + SSE) | 4–6 days | Phase 3 |
| 3. Rsbuild (incl. dev-server spike) | 2–3 days | Phase 4 |
| 4. Preact port | 5–8 days | Phase 5 |
| 5. Routing + SSR shell | 1–2 days | Phase 6 |
| 6. Packaging + polish | 1–2 days | — |
| **Total** | **~3–4 weeks** | |

**Phases 1 and 2 can run in parallel with 3 and 4** if you split the repo into `src/server/` and `src/client/` on day one — they touch disjoint file sets.

---

## 12. Verification checklist

### Per-phase gates (must all pass before advancing)

**Phase 1 — SQLite**
- [ ] `sqlite`/`sqlite3` gone from `package.json` and `bun.lock`
- [ ] `bun test` green
- [ ] All 10 tables created (`workspace_folders`, `sessions`, `app_settings`, `chat_sessions`, `deleted_workspaces`, `archived_sessions`, `session_ui_state`, `queued_messages`, `session_stream_state`, `files`)
- [ ] `MOCK=true` seeding works
- [ ] `MOCK=false` + `SYNC_WORKSPACE=true` folder discovery works

**Phase 2 — Elysia**
- [ ] Endpoint parity: 64/64 byte-identical responses (baseline recorded pre-migration)
- [ ] WS transport: `connected` → frames → close, with `409` refusal
- [ ] SSE transport: identical frames, 30s heartbeat, `message_update` coalescing
- [ ] Compression on JSON, off on `text/event-stream`
- [ ] CLI `serve/stop/restart/status/logs` green
- [ ] SIGTERM reaps omp children
- [ ] **Every API domain has its own folder under `src/server/routes/`; no `.ts` file sits flat in `routes/` root except `index.ts`**
- [ ] **`routes/index.ts` is the only file that enumerates domains** — domain folders never import each other

**Phase 3 — Rsbuild**
- [ ] `bun run build` → `dist/client` + `dist/server`
- [ ] Vendor chunk splitting (katex / markdown / prism)
- [ ] HMR + WS on one port
- [ ] `public/` served

**Phase 4 — Preact**
- [ ] Zero React in the bundle (`grep -c '"react"' dist/client/static/js/*.js` → 0)
- [ ] All panels render: files, search, git, terminal, context, browser, user-browser, usage
- [ ] Panel resize + pixel-width restore
- [ ] Portals, lazy panels, xterm, mermaid, katex, prism

**Phase 5 — Routing**
- [ ] `?sessionId=` deep link works on cold load
- [ ] `.well-known` devtools probe returns `{}`
- [ ] 404 for unknown `/api/*`, SPA fallback for unknown pages

**Phase 6 — Packaging**
- [ ] `ompchamber serve --prod` boots from `dist/`
- [ ] Health probe green (`GET /api/health`)

### Standing gates (from `AGENTS.md`, unchanged)

```bash
# No file over 350 lines
find src -name "*.ts" -o -name "*.tsx" | xargs wc -l | awk '$1>350'   # must print nothing

# No relative imports
grep -rnE "from '\.\.?/" src --include='*.ts' --include='*.tsx'         # must print nothing

# No flat route files — routes/ root holds only index.ts
find src/server/routes -maxdepth 1 -name '*.ts' ! -name 'index.ts'      # must print nothing

# No unused code
npx tsc --noEmit --noUnusedLocals --noUnusedParameters
```

> `AGENTS.md` §4 documents `@/` → `./app/*`. **Update it to `@/` → `./src/*` in the same commit as the directory move**, along with §1's verification path and §10's route-organization section. §10 currently says routes are organized by "Remix flat-routes directory nesting conventions" — replace that clause with "one Elysia plugin folder per API domain under `src/server/routes/`, composed by `routes/index.ts`; the flat-file ban and the domain-folder requirement are unchanged." Leaving stale rules in `AGENTS.md` will make every subsequent agent task wrong.

---

## 13. What does NOT change

Worth stating explicitly, because it bounds the work:

- **`tailwind.css`** — byte-identical. Tailwind v4 works via PostCSS.
- **`DESIGN.md`** — the design system is CSS-variable based and framework-agnostic.
- **All 22 `app/types/**` files** — pure TypeScript, moved to `src/shared/types/`.
- **The 107 client-safe `app/lib/**` files** — pure logic (markdown, fs parsers, chat ordering, panel widths, git graph). Moved, not rewritten.
- **The omp RPC layer** (`app/lib/omp/**`, ~47 files) — server-only, Node-builtin-based, runs unchanged under Bun. This is ~25% of the codebase and it is **not touched**.
- **`app/data/**`** — static datasets.
- **`public/**`** — icons, manifest, service worker.
- **The `globalThis.__ompSessions` registry contract** — the key decoupling that makes the WS transport portable.
- **`bin/**`** — the CLI's argument parsing, registry persistence, process lifecycle, health probing. Only `buildServeInvocation()` changes (§5.8).
- **The `MOCK` / `SYNC_WORKSPACE` / `OMPCHAMBER_DB_PATH` env contract.**
- **The 350-line file ceiling, `@/` import rule, kebab-case folder rule, and domain grouping** — the codebase discipline carries over verbatim.

---

## 14. Open questions (resolve before Phase 3)

1. **Dev server topology** — does `@rsbuild/core@2` expose a documented connect→fetch bridge, or must we hand-write the ~40 LOC adapter in §6.4? *Spike first; this decides the whole dev story.*
2. **Elysia `.ws()` + `bufferedAmount`** — is it exposed on `ws.raw` under Bun 1.4? *If not, backpressure policy needs a different mechanism.*
3. **`react-resizable-panels` v4 under Preact** — does `Group`/`Panel`/`Separator` (the v4 API) work via compat? *This is the single highest-value spike in Phase 4.*
4. **SSR at all?** — `_index.tsx`'s loader is deliberately cheap. If we accept a brief theme flash, SSR could be dropped entirely and the app becomes a pure SPA served by `indexHTML: true`. **That would remove Phase 5's SSR handler and `preact-render-to-string` from the dependency list.** Decide deliberately; the current SSR exists only to avoid a theme/UA flash.
5. **`react-icons` in `FileIcon.tsx`** — 1 file. Hand-port to inline SVG and drop the dependency, or keep compat for it?
