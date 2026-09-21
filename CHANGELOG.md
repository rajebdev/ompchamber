# Changelog

All notable changes to OMPChamber are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- Ordering: nothing reorders messages any more — neither the API nor the UI. `GET
  /api/chat/:sessionId` returns the session's messages in **file order**, and the timeline renders that
  array as-is, so a notice row appears exactly where omp wrote it. The server-side notice/turn swap,
  the five scattered display-side copies (`session-load` fetch + older-page prepend, rollback
  refetch, optimistic send, live stream folding) and `src/shared/lib/chat/order.ts` are gone.

### Changed

- Chat: the AI run footer (provider · model · date · duration · tokens · actions) is now the run's own
  boundary row instead of living inside the last answer bubble. It renders after every row the run owns
  — including notice rows omp wrote at its tail — so it is always immediately before the next user
  message, and a notice-only stretch never gets one. Placement is resolved once per timeline in
  `src/shared/lib/chat/timeline/run-footer.ts`; `MessageItem` no longer renders a footer and drops its
  footer-only props (`provider`, `providerNames`, `modelName`, `modelNames`, `thinkingLevel`,
  `footerVisible`, `durationMs`, `isMobile`, `onRetry`).

## [0.3.0] — 2026-09-21

### Added

- `ompchamber update` — self-update from GitHub releases, with `--check`, `--force` and
  `--no-restart`. The install is replaced in place: `bun add -g ompchamber@<version>` for a bun
  global install, or fetch + `--ff-only` merge to the release tag + `bun install` + client rebuild
  for a git checkout. A running instance is restarted on its recorded port and mode afterwards; an
  uncommitted work tree is never merged over.
- Install-method detection (`bun-global` / `git` / package-manager / unmanaged) shared by the CLI
  and the console, so an install that cannot replace itself reports the exact command to run.
- The console's **About → Updates** button now performs a real OMPChamber update instead of
  reporting it as manual, and the update check reads the version from disk so a completed update
  stops showing as available before the server restarts.
- `GITHUB_TOKEN` / `GH_TOKEN` is honoured for release lookups, raising the unauthenticated GitHub
  API rate limit (60/hour per IP).
- GitHub Actions publish pipeline (`.github/workflows/publish.yml`): publishing a GitHub release
  installs, typechecks, builds `dist/client`, verifies the release tag against the `package.json`
  version and runs `bun publish` against npm.

### Changed

- `package.json` is publishable: `private` removed, and `files` limits the tarball to `src`,
  `dist/client` and `tsconfig.json`.

## [0.2.0] — 2026-09-21

The stack rewrite release: **Remix + React 19 + Vite → Elysia + Preact + Rsbuild on Bun**, plus the
agent-stream WebSocket transport, Shiki highlighting, and a persistent message queue.

### Added

- Agent event stream over **WebSocket** (`GET /api/agent/:sessionId/ws`), selectable in
  Settings → Chats, with SSE as the fallback transport and a shared connection status indicator in
  the navbar and mobile header.
- **Shiki** syntax highlighting replacing PrismJS and ANSI-colored tool output — a dual
  `one-light` / `one-dark-pro` theme pair plus 26 more languages, consumed through
  `--shiki-light` / `--shiki-dark` CSS variables.
- Hand-rolled resizer (`group` / `panel` / `separator`) replacing `react-resizable-panels`, with
  one remembered pixel width per panel and per right-panel view.
- Hand-rolled Preact code editor replacing `react-simple-code-editor`.
- `lucide-preact` icons plus static brand SVGs replacing `react-icons`.
- Persistent message queue stored in a `queued_messages` table with a model snapshot, stop-all
  semantics and stick-to-bottom scroll.
- In-place **undo / rewind** for omp sessions by truncating the session JSONL, behind a
  confirmation modal.
- Structured MCP tool renderer with per-key JSON display, and a renderer for omp hashline edit
  patches.
- Ripgrep-backed search panel streaming matches over SSE as the tree is walked.
- Behavior settings panel bound to native `AGENTS.md` and `RULES.md`, and the full native omp
  config schema in the OMP Engine panel.
- Server-side pagination for the Context panel raw-message list, with telemetry auto-reload while
  a session is streaming.
- Auto-refresh of open file panels on AI file-mutating tools, and of the sidebar when a response
  starts.
- Server-authoritative per-session stream status in the sidebar, plus a workspace sort comparator
  shared between client and server.
- Provider metadata (display label, timestamps) threaded through timelines and rendered in the
  message footer.
- Mobile view running the shared chat timeline, with a root menu for AI messages.
- `bun run dev:lan` to expose the dev server on the LAN.

### Changed

- Runtime is Bun-only end to end: `bun:sqlite` replaces `sqlite3`, `Bun.spawn` / `Bun.spawnSync`
  replace every `node:child_process` call site, `Bun.YAML` replaces the `yaml` package,
  `Bun.gzipSync` / `Bun.file` / `Bun.Glob` replace their `node:` equivalents, and the omp RPC layer
  reads NDJSON from a Bun `ReadableStream` instead of `node:readline`.
- Server is a single Elysia app shared by dev and prod; routes are grouped by domain with one
  plugin per domain, mounted from `src/server/routes/index.ts`.
- Client runs on Preact 10 — zero React packages in the dependency tree.
- Modules are split three ways (`src/client`, `src/server`, `src/shared`) with the `@/` alias
  mandatory: no relative imports, no re-export barrels.
- CLI moved from `bin/` to `src/cli/` and stripped of Node builtins; it resolves its data
  directory through `os.homedir()` so paths stay absolute without a shell.
- omp config, session and subagent layers converted from synchronous fs to async `Bun.file`.
- Persisted settings live exclusively in SQLite — the single source of truth.
- Syntax colors are the only chroma outside dark themes; every other surface uses theme tokens.

### Removed

- React packages: `react`, `react-dom`, `react-icons`, `react-markdown`,
  `react-resizable-panels`, `react-simple-code-editor`, `motion`, `lucide-react`, `prismjs`.
- Build tooling: `@remix-run/*`, `vite`, `@tailwindcss/vite`, `autoprefixer`,
  `remix-flat-routes`, `vite-plugin-pwa`, `@resvg/resvg-js`.
- Markdown extras: `rehype-raw`, `remark-gfm`.
- Data helpers: `sqlite`, `sqlite3`, `yaml`, `isbot`.

### Fixed

- Layout: right-panel view and editor-mode switches restore the panel's remembered width instead
  of snapping back to a default, and fixed panels shrink correctly when the container is squeezed.
- omp: tool output keeps its whitespace when a JSONL session is reloaded; the adopted session id is
  used when a stream ends in error, so the sidebar refreshes; the DevTools port is probed before a
  stale browser endpoint file is trusted; directory guards use `stat`, ending silent project-path
  probe failures.
- CLI: home resolves through `os.homedir()`, keeping `stop` / `status` pointed at the real
  `~/.ompchamber` when `HOME` is absent (cron, launchd, GUI launchers).
- Dev loop: hot-update artifacts are proxied on any path, lazy compilation is disabled to stop HMR
  trigger 404s, and dev assets are served `no-store` so a stale bundle cannot pin in the browser.
- Terminal reports real runtime versions instead of hardcoded strings.
- Providers can be disabled, removing them from the model list; the model picker starts empty and
  shows a loading skeleton.

## [0.1.0] — 2026-09-14

Initial public snapshot on the Remix + React + Vite stack.

### Added

- Workspace and session sidebar over omp's project registry.
- Streaming chat timeline with thinking accordions, tool-call cards and a composer.
- Editor panel plus right-hand developer panels: context telemetry, files, search, git, terminal,
  browser, and the mobile layout.
- SQLite-backed settings, and the `MOCK=true` / `MOCK=false` demo-versus-real data modes.
- `ompchamber` CLI: `serve`, `stop`, `restart`, `status`, `logs`.

[0.2.0]: https://github.com/rajebdev/ompchamber/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/rajebdev/ompchamber/releases/tag/v0.1.0
