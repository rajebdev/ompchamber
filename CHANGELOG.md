# Changelog

All notable changes to OMPChamber are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.8.0](https://github.com/rajebdev/ompchamber/compare/v0.7.0...v0.8.0) — 2026-09-22

### Added

* **chat:** answer the ask tool inline with every question and answer ([92baa04](https://github.com/rajebdev/ompchamber/commit/92baa043b59c24731f84655502a6b333a8c5993f))
* **editor:** render long files lazily in the code surface ([fb30237](https://github.com/rajebdev/ompchamber/commit/fb302374a27499513015725f06851949a73a89d7))
* **markdown:** repaint mermaid diagrams on theme switch and open them in a zoom/pan viewer ([7b89852](https://github.com/rajebdev/ompchamber/commit/7b89852d59fe60bcbf5efaad922753da1e9ee2bd))
* **release:** credit contributors in the generated changelog ([af11d2a](https://github.com/rajebdev/ompchamber/commit/af11d2aaafb10286b722252fad9084ea4572a43a))
* **sidebar:** flag sessions waiting for input with an icon and a cue ([5253963](https://github.com/rajebdev/ompchamber/commit/52539636a2ede8205783ee420d5e9d0bd8bff569))

### Fixed

* **chat:** stop the thinking level resetting to off on send ([470d283](https://github.com/rajebdev/ompchamber/commit/470d2838774311c208e3d61e3e1cc8e0ec3cf065))
* **file-explorer:** refresh git status on the same triggers as the listing ([c983ac1](https://github.com/rajebdev/ompchamber/commit/c983ac1a97386991acc4025eb02e74b38ff78402))
* **rpc:** keep a session alive while it is blocked on a dialog ([cace9e3](https://github.com/rajebdev/ompchamber/commit/cace9e396e714b7074bd1b4c2128057250fb5ca3))

## [0.7.0](https://github.com/rajebdev/ompchamber/compare/v0.6.0...v0.7.0) — 2026-09-22

### Added

* **session:** mark the live stream status at prompt dispatch, not agent_start ([c148bc5](https://github.com/rajebdev/ompchamber/commit/c148bc5631cfcd2a034e05d650ee2a3ff0ea352a))
* **update:** restart the updated instance and leave servers started from source alone ([a25f8ca](https://github.com/rajebdev/ompchamber/commit/a25f8ca56727d59e8de606641e7cc5daee85dc9f))

### Changed

* **readme:** document the automatic restart and the source-run exception ([0ea1135](https://github.com/rajebdev/ompchamber/commit/0ea11350f56692cf8d6d30fd36d8759ba358eee2))

### Fixed

* **lifecycle:** record the launch mode from argv, never from the environment ([9697514](https://github.com/rajebdev/ompchamber/commit/9697514c3a32135308178e0025fb2a47d675bb43))

## [0.6.0](https://github.com/rajebdev/ompchamber/compare/v0.5.0...v0.6.0) — 2026-09-21

### Added

* **server:** guard ports and register every running instance ([5358864](https://github.com/rajebdev/ompchamber/commit/5358864d5c52e6fff12c95310b7d7402ceb45759))

### Fixed

* **editor:** keep content after autosave and align gutter with wrapped rows ([3f82fbe](https://github.com/rajebdev/ompchamber/commit/3f82fbeb00eeb4a5ae3c3956ac6c3c92361e86fb))
* **layout:** enforce panel floors, per-view defaults and sane widths ([49349e6](https://github.com/rajebdev/ompchamber/commit/49349e6df4d5f205d6a735598a61d0c115558cf2))
* **markdown:** stop mermaid leaking its syntax-error banner into the body ([1dd19e9](https://github.com/rajebdev/ompchamber/commit/1dd19e9c305b512abb803ceead977cc1eca2f540))
* **mobile:** keep the header session picker inside the viewport ([ac19515](https://github.com/rajebdev/ompchamber/commit/ac1951519b0cf88b02a48bd5a0bf18df138a1d51))
* **server:** serve public assets from the build output too ([5c694b8](https://github.com/rajebdev/ompchamber/commit/5c694b832650119d33826ef6832fe4960866eb42))

## [0.5.0] — 2026-09-21

MOCK flips to real data by default, a missing `omp` binary refuses startup instead of degrading into
a dashboard whose every action fails, and the MOCK chat transport drops its Gemini dependency.

### Added

- Startup gate: OMPChamber is a console for a **live** omp install — every agent session, config
  read/write, session-state query and update shells out to the `omp` CLI — so the binary is now a
  startup precondition rather than a degraded mode. `src/server/lib/omp/core/startup.ts` (new) holds
  `ompStartupError()` (the actionable refusal) and `ompStartupLogLines()` (the executable plus the
  `~/.omp` tree the process reads); `src/server/index.ts` runs the gate before the listener opens and
  before `getDb()` — the database is opened lazily, so a refused start never touches it — and
  `ompchamber serve` applies the same gate before spawning, so a failure leaves no detached child, no
  log file and no registry entry pointing at a process that already exited. `MOCK=true` is exempt:
  demo mode exists to run without a real install.
- Startup banner: the resolved paths every session/agent diagnostic traces back to — data mode, omp
  binary, config dir, agent dir, SQLite file, then the provider and model counts omp reports, with
  `listening` last. The registry probe is a live RPC round-trip (a cold utility process takes
  seconds), so it runs **after** the listener accepts requests: startup is never delayed, only the
  final banner line is, and the shared utility process is left warm for the first `/api/models` call.
  The provider count is the number of providers that actually serve a model — omp's login catalog
  lists 75 sign-in offers, 73 of them without credentials, and counting those would report a provider
  set the chamber cannot use — i.e. the same set `GET /api/models` groups by.
- `fetchOmpRegistrySnapshot()` (`src/server/lib/models/provider-registry.server.ts`) extracts the two
  RPC parses so the provider settings page and the startup banner read one implementation, guarded by
  `DetectedLoginProvider` instead of a structural assumption about the response.

### Changed

- **Breaking:** `OMP_WEB_OMP_BIN` is renamed **`OMPCHAMBER_OMP_BIN`**, matching the other host
  variables (`OMPCHAMBER_PORT`, `OMPCHAMBER_HOST`, `OMPCHAMBER_BUN`). The old name is no longer read,
  so an explicit binary path must move to the new variable or fall back to a `PATH` lookup.
  `README.md` and `ompchamber --help` document the requirement and the variable.
- `MOCK` now defaults to **real data**: `isMockMode()` (`src/server/mock.server.ts`) is true only for
  an explicit `true` / `1` / `on` / `yes`, and unset or unrecognized values run against real
  resources. The chamber is a diagnostic console for a live omp install, so demo presets are opted
  into rather than inherited by omission; `getMockModeInfo().rawEnv` reports `false (default)`.
  `.env.example`, `README.md` and `DESIGN.md` document the default, and
  `src/client/data/models/catalog.ts` now states its MOCK-only contract: `POST /api/models` in real
  mode starts from an empty catalog instead of seeding the shipped demo rows, so a demo model can
  never be persisted into a real install's stored catalog.
- MOCK chat streaming no longer calls a real Gemini endpoint — `onStart` always runs the simulated
  handler, so the demo transport has no network dependency and no API key to configure. The
  `!isMockMode()` 400 guard on `POST /api/chat/stream` is unchanged: real mode still has no streaming
  endpoint.

### Fixed

- Files panel: **Copy Path** copied a hard-coded template prefix —
  `'/app/applet/examples/' + file.path` — so every entry produced a path that resolves nowhere outside
  the original applet sandbox. The listing's absolute base was already in the payload (`/api/fs/dir`
  answers `root: baseDir`, the resolved workspace root or the selected `repo=` directory) and the
  client now keeps it in `listingRoot`, threading it down through `FileTreeItem`'s own child recursion
  as `basePath` so the base travels with the tree instead of being re-derived per node.
  `toAbsolutePath()` (`src/shared/lib/fs/paths.ts`, new) joins base and relative path with the base's
  own separator, strips only `/` and `./` prefixes — a dot-file name such as `.env` survives — and
  falls back to the relative path when no base is known, so a rejected listing degrades instead of
  inventing a root; anchoring on the server-resolved base also means a `~`-relative or
  allow-list-rejected client `rootPath` cannot yield a wrong absolute path. Both copy actions now go
  through `copyToClipboard()`, whose textarea fallback keeps copying working on an insecure origin
  where `navigator.clipboard` is undefined. Copy Relative Path is unchanged.

### Removed

- `@google/genai` — the SDK, its `GEMINI_API_KEY` env read and the dead handler that used them.
  `handleGeminiStreaming()` is deleted from `src/shared/lib/chat/stream-service.ts`, the real-Gemini
  branch from `src/server/routes/chat/stream.ts`, the key block from `.env.example`, and
  `MAJOR_CAPABILITY_SERVER_SIDE_GEMINI_API` from `metadata.json`. Provider model names in the catalogs
  and the generic `?key=` model-list probe in `routes/settings/provider-models.ts` are unrelated and
  untouched.

## [0.4.0] — 2026-09-21

### Added

- Files panel: entries git refuses to track now render dimmed — the icon at 40% opacity and the name at
  `text-ink/40` against the panel's `text-ink/80`, with a `<path> — git-ignored` tooltip; a live
  git-status colour still wins when both apply. `collectIgnoredPaths()`
  (`src/server/lib/fs/git-ignore.ts`) runs one `git check-ignore --stdin -z` **per directory listing**,
  never per entry, so local (`.gitignore`, `.git/info/exclude`) and global (`core.excludesFile`)
  rules are covered alike: paths travel NUL-separated over stdin, stdout is drained while stdin is
  written, and a non-zero exit (no match, not a repository, git absent) yields an empty set instead of
  an error. `listEntries` emits the verdict as `FsNode.ignored`, which the search filter and expanded
  children preserve.

### Changed

- Chat: tool output is now rendered as **markdown** wherever it is shown as a block (`FallbackOutput` and
  the `edit`/`write` card's Execution Output). An XML wrapper that opens the output — omp's
  `<system-reminder …>…</system-reminder>` — is peeled first, its attributes (`reason`, `rule`, `path`)
  become the block's header row, and content markdown would reflow (a log, a JSON body, an HTML dump) is
  fenced so it stays verbatim instead of collapsing into a single paragraph. A tool card whose result
  carried a reminder also flags it in the header: bell + red **Reminder** left of the status badge.
- Chat: the AI run footer (provider · model · date · duration · tokens · actions) is now the run's own
  boundary row instead of living inside the last answer bubble. It renders after every row the run owns
  — including notice rows omp wrote at its tail — so it is always immediately before the next user
  message, and a notice-only stretch never gets one. Placement is resolved once per timeline in
  `src/shared/lib/chat/timeline/run-footer.ts`; `MessageItem` no longer renders a footer and drops its
  footer-only props (`provider`, `providerNames`, `modelName`, `modelNames`, `thinkingLevel`,
  `footerVisible`, `durationMs`, `isMobile`, `onRetry`).
- Chat: the session sidebar refreshes on the run's **first completed assistant turn** instead of waiting
  for `agent_end` or the 8 s stream poll, so a session's real title and `updated_at` stop lagging a
  whole turn behind. A completed turn is the first point where the refresh can return anything new —
  omp writes the session JSONL (auto-title at line 1) at `message_end`, whereas a token-level signal
  would fire earlier and re-scan the same file — and the role check excludes `notice` rows, which
  include the `system-reminder` frames the live stream stamps on non-user rows. The per-run guard in
  `src/shared/lib/chat/omp/omp-callbacks.ts` is re-armed at `agent_start` and on stream reattach, so
  later assistant segments cannot keep resetting the throttle window.
- Client bundle: the three heaviest assets are no longer on paths most pages never touch. Mermaid 12
  made `elk` the default `layout`, so **ELK (1.48 MB raw / 434 kB gzip) is gone** — `layout: 'dagre'`
  is pinned in `mermaid.ts` (verified byte-identical across 20 diagram types) and `elkjs` is aliased
  to a stub that throws, because a diagram that explicitly asks for ELK should fail loudly rather than
  silently render with a different layout. **Shiki** stopped calling `loadAllLanguages()` at boot:
  `highlighter-lazy.ts` owns the policy — a grammar is fetched the first time a caller asks for that
  language, callers keep rendering synchronously on the plain-text fallback, and `onLanguageReady` /
  `useSyntaxReady` re-render them when the chunk lands. **KaTeX** left the critical path the way mermaid
  already had: `marked.ts` emits a `.math-pending` placeholder carrying the TeX source and `katex.ts`
  swaps in real markup after the async chunk arrives, with both DOMPurify traps handled (a bare
  root-level `<span>` is dropped, and `data-math*` must be allowlisted or hydration has nothing to
  read). KaTeX fonts are regenerated woff2-only and Fira Code is a latin-only face set, taking 1.8 MB
  of font files to 388 KB. Measured: initial payload 496 kB → 374 kB gzip, cold-boot chunk requests
  58+ → 20.
- Client bundle: the settings modal and the mobile layout are lazily loaded, since at most one of the
  two trees is ever used and the settings tree only appears behind a click — initial payload 374.4 kB
  → 252.6 kB gzip (-32.5%). `settings/LazyModal.tsx` is now the modal's single import path and its
  `isOpen` gate is load-bearing rather than cosmetic: `lazy()` starts fetching as soon as it renders,
  even when the wrapped component would render `null`, so without the gate the 68 modules plus the
  162 kB `omp-schema.json` would be requested at boot. `App.tsx` imports `MobileLayoutWrapper` lazily
  too, because `initialIsMobile` is known before the first render; the runtime "Switch to Mobile View"
  toggle still loads the chunk on demand, and `fallback={null}` is indistinguishable from the
  pre-hydration frame since `body` already paints `--theme-canvas`.

### Fixed

- Ordering: nothing reorders messages any more — neither the API nor the UI. `GET
  /api/chat/:sessionId` returns the session's messages in **file order**, and the timeline renders that
  array as-is, so a notice row appears exactly where omp wrote it. The server-side notice/turn swap,
  the five scattered display-side copies (`session-load` fetch + older-page prepend, rollback
  refetch, optimistic send, live stream folding) and `src/shared/lib/chat/order.ts` are gone.
- Chat: a `notice` row that kept the turn's own text is an **assistant answer**, not a card — omp
  sometimes writes the reply into `notice`, and the timeline rendered it as a collapsed System Notice
  with the answer hidden while the JSONL mapper deleted the tags that text quoted. One classifier
  (`src/shared/lib/chat/timeline/notice-row.ts`) now decides for the whole timeline: a notice row
  carrying the turn's metadata (model, provider, usage, `durationMs`, `startedAt`, `completedAt`,
  `thinking`, `toolCalls`) renders as content, with `thinkingLevel` excluded on purpose because the
  live stream stamps it on every non-user frame. The JSONL mapper and `messages-map.ts` likewise turn
  only a text block that **is** a reminder envelope into a notice, so prose quoting the tag stays
  content — and such a row owns its run footer and Copy action like any other AI row, so the turn's
  own usage finally surfaces.
- RPC: a command timeout no longer counts as proof the omp child has wedged. omp runs RPC handlers one
  at a time, so the `get_state` (5 s) and prompt-ack (30 s) caps also fired while a turn sat queued
  behind the child's own work, and the reset destroyed the live turn and every subagent under it. A
  timed-out command against a busy session now answers `session_busy` and leaves the child alone; only
  an idle, unresponsive session is reset, and `GET /api/agent/:id` answers a busy session from local
  flags so the attach probe cannot queue a `get_state` behind the running turn. Liveness also learned
  about subagents: `subagent-liveness` folds `subagent_lifecycle` / `progress` / `event` frames into a
  roster (identity is `id` with an index alias for id-less frames, and stale entries are pruned) and
  `AgentSessionWrapper#isBusy()` gates the idle reaper and `reconcileSpawnApprovalMode` on it, where
  `isRunning()` alone knew nothing about a subagent outliving its parent turn. With the automatic reset
  no longer covering a busy session, **Stop** escalates to an explicit `force_reset` after 10 s without
  a clean stop, and the client reattaches instead of auto-resending a prompt whose ack timed out — it
  may already have been accepted.

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

[0.5.0]: https://github.com/rajebdev/ompchamber/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/rajebdev/ompchamber/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/rajebdev/ompchamber/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/rajebdev/ompchamber/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/rajebdev/ompchamber/releases/tag/v0.1.0
