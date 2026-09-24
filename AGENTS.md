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
- **Chat Timeline** (center): the streaming agent conversation — thinking accordions, tool-call cards, rendered mermaid diagrams (click one to open the zoom/pan viewer in `src/client/components/common/diagram-viewer/`), queue panel, and the composer (`src/client/components/workspace/chat-timeline/`).
- **Editor Panel**: opened-file tabs and code editing (`src/client/components/workspace/editor/`).
- **Right Panel + Activity Bar**: switchable developer panels — `context` (Context & Telemetry), `files`, `search`, `git` (Source Control), `terminal` (Bun), and `browser` (`src/client/components/workspace/`, `src/client/components/layout/RightActivityBar.tsx`).

### Agent Event Stream Transport
- The live omp agent bridge (`POST /api/agent/:sessionId` for commands) streams events over **WebSocket by default** — `GET /api/agent/:sessionId/ws` — with **SSE** (`/api/agent/:sessionId/events`) as the fallback, selected in **Settings → Chats → Streaming Transport** (`streamTransport` in `omp_chamber_settings`; default `websocket`).
- Server side is one Elysia app for dev and prod: `src/server/index.ts` owns the port and mounts `src/server/routes/`, so the agent WebSocket (`src/server/routes/agent/ws.ts`) is a first-class `.ws()` route on that same listener. Started by `bun run dev` (watched) and `bun run start` / `ompchamber serve --prod`.
- Client side: `src/shared/lib/chat/omp/{transport,socket,sse}.ts` own the connections; both hand every frame to `src/shared/lib/chat/omp/agent-events.ts`, which folds it into chamber state. Keep frame handling in that folder — never fork behavior per transport. The two connectors are transport-generic (`connectSocket`/`connectEvents` take a URL); a session's BTW stream dials the same pair against `/api/btw/:sessionId/*` instead of adding a third flavour.
- **Session auto-titling is ONE-SHOT per conversation, with one retry inside the first run** (`src/server/lib/omp/session/auto-title.server.ts`, fired from the `message_end` and `agent_end` branches of `src/server/lib/omp/rpc/frame-fold.ts`). omp force-sets `PI_NO_TITLE=1` under `--mode rpc-ui`, so the chamber asks for the title itself by sending `/rename` to the child. **The trigger is the first settled USER message, not `agent_start`** — omp pushes `agent_start` before the turn opens, so the transcript is still empty there and a `/rename` at that point reads `messageCount: 0` and is answered "Could not generate a session title" (measured on omp 18.3.0: the user message lands ~120ms after `agent_start`). `message_start` is equally too early — omp appends the message to the agent's state on `message_end`, so only that frame makes `get_state` report it. `agent_end` then retries ONCE as the fallback, for the early attempt that came back empty (provider error, timeout, child gone, or the tiny model declining); it stands down when the early generation is still in flight (`autoTitleWindowUntil` unexpired — re-asking would reserve a fresh title revision and cancel it) and is a no-op when the name already landed. Never fire it beyond that: omp derives the title from the NEWEST turns and `generateRenameTitle` reserves a fresh title revision (cancelling any generation still in flight), so an attempt after turn two names the session after whatever the conversation had become by then — the bug this gate exists to prevent. The eligibility latch is `AgentSessionWrapper.autoTitlePending`, seeded in `applyIdentity` from omp's own `messageCount` (a `--resume` child reports the messages it restored, so an existing session is ineligible from the start) and consumed by the settle attempt — the early attempt deliberately does NOT consume it, or a first-turn failure would leave the session unnamed for good. `autoTitleRequested` (reset at each `agent_start`) keeps a queued steer message from re-asking inside the same run. A first message omp's low-signal filter rejects ("hi") therefore leaves the session unnamed for good — the honest outcome, since the fallback does re-ask and omp declines a second time (the rejection is a property of the opening message, not of when it is asked).

### Side Questions (BTW panel)
- `/btw [question]` typed in the main composer **replaces the composer with the side-question panel** (`src/client/components/workspace/btw-panel/`, swapped in by `ComposerDock`, opened by the `omp:btw` window event; the mode state machine is `src/client/hooks/chat/btw/mode.ts`); bare `/btw` opens it on the current history. **The open flag is deliberately NOT persisted** (`useState`, not `useSessionState`): a panel that reopened itself on load left the user with no chat composer and a field they never asked for, and a `/btw` typed into that field became a real question to the model. The panel is a mode the user enters, so every load starts in the chat — while the drafts and the selected topic do persist (`chat.btwAsk` / `chat.btwFollowUp` / `chat.btwTopicId`), so leaving and re-entering loses nothing. The panel is **two cards**: the panel card — the ask card as its **header** (the field that starts a new topic, plus `⟳` start over, `⌄` topic history, `⧉` promote into chat, `✕` leave), the running turn's `GeneratingIndicator`, and the topic's turns as its body — and the composer below it for follow-ups. The ask field must stay a header rather than a free-standing card above the composer: as its own card it read as a second composer and users typed follow-ups into it. The answer card is capped at `520px` (`ANSWERS_MAX_HEIGHT_PX`) with its own scrollbar, and the header stays visible while the body scrolls.
- **The panel renders the CHAT's timeline, not a btw-specific one.** A turn's `messages` are `ChatMessageData` — the same shape the chat timeline folds — so `BtwMessages` builds one row list (each question as a user row, then that turn's conversation) and hands it to the chat's own `MessageList`. A tool the side child runs therefore draws the same card it would in the chat, and thinking / usage / errors come along; the two renderers cannot drift. On the server the conversation is accumulated by `trackTurnMessage` (`src/server/lib/btw/lifecycle.server.ts`) through the shared `toChatMessage` mapper, with the SAME by-id upsert the chat stream's `onMessageUpdate` performs (omp emits one frame per segment carrying that segment's full accumulated content). `BtwTurn.answer` stays as the plain-text summary (history labels, promotion titles) and is the fallback for a turn stored before the conversation column existed.
- **The run footer's token counts come from `message_end`, not the streaming frames.** omp's `message_update` frames report `usage` zeros; only the completed message carries the real counts, so `handleFrame` upserts `message_end` too (same message id → the streaming row is replaced in place). Dropping that branch is silent: the footer renders without its `… tok` segment. The row also carries the child's own `thinkingLevel` (captured from `get_state` at spawn, since omp may resolve the requested level differently) and its `model`, which is what the footer's `high • …` segment reads.
- **`BtwState.live` carries the running turn**, not just frames: a client attaching mid-turn (a reload, a second tab) would otherwise get a snapshot whose running turn has no persisted messages yet and would show an empty answer while the child streams on. The `btw_message` / `btw_activity` frames drive the live upsert; the state is the seed. The child echoes the `<btw>`-wrapped prompt it received, and the panel drops that user echo (it already renders the user's own question).
- **The indicator's verb is the side child's own.** `btw_activity` carries it, derived server-side from that child's frames (`describeAssistantPhase` / `describeToolActivity`) — the chat's verb describes a different process and must never be borrowed. `PHASE_VERBS.sideQuestion` ("Answering side question") is the honest fallback before the child reports anything, since the side stream cannot tell reasoning from prose.
- **The child ECHOES the prompt it received**, and that echo is the `<btw>` wrapper the panel itself built, so it is filtered out of the rendered rows — the panel draws the user's own question instead. A legacy turn's plain `answer` is rendered only when it has no stored conversation.
- **Model / thinking / access target the side child, not the chat.** `POST /api/btw/:sessionId` actions `set_model` and `set_thinking_level` reach the live child over RPC (omp applies them to the running turn). `set_access_mode` cannot: omp exposes no RPC for the approval mode, so an idle child is dropped and the next question respawns it with the new `--approval-mode` — the same reconcile the chat session does. Picks made before a topic exists are held per session (`chat.btwModel` / `chat.btwThinking` / `chat.btwAccess`) and ride the first `ask` to the spawn; that is why those three are session UI state rather than topic props.
- **omp's `/btw` is TUI-only**, so the chamber implements it. Its registry entry in `omp 18.2.6` has `handleTui` and no text-mode `handle`, and RPC dispatch only runs entries with `handle` — sending `/btw …` as a prompt would reach the model as literal text. Client interception lives in `src/client/hooks/chat/timeline/actions.ts`; server behaviour in `src/server/lib/btw/`. Because `get_available_commands` cannot advertise it, the composer's `/` popup gets its entry from the chamber-owned pool in `src/shared/lib/chat/composer/client.ts` (`CHAMBER_COMMANDS`, byte-identical to omp's own description and `[question]` hint) — never from omp's list.
- **Context arrives by transcript reuse, never by re-prompting it as text.** A topic owns a private copy of the parent session file (`<db dir>/btw/<sessionId>/<topicId>/session.jsonl`) taken on its first question; the side child is spawned as `omp --mode rpc-ui --resume <that copy>` (`src/server/lib/btw/child.server.ts` builds the argv). The parent's prompt-cache prefix survives, the parent file is never written (verified: byte-identical after many questions), and a follow-up after the child was reclaimed resumes the copy and still sees every earlier turn.
- **The side child runs WITH tools** — this deliberately diverges from omp's TUI `/btw`, which passes `--no-tools`. The panel offers a real access-control dropdown, and an approval mode that governs nothing would be a lie in the UI; the `<btw>` prompt therefore keeps omp's brevity rules but drops "NEVER use tools" (`src/server/lib/btw/prompt.ts`). A gated tool call parks the turn on an `extension_ui_request`, so `BtwRuntime` tracks them with the shared `PendingUiDialogs` and `btwStateFor` ships them as `BtwState.dialogs` — part of the state, not a frame, so a reload replays the modal a child is still blocked on (omp never re-delivers the request). There is no tool card here to host an `ask` inline, so every answerable request is a modal; a dialog whose child died is cleared on settle, exit and teardown rather than left over an idle panel.
- **One side question in flight per session** — no implicit queue, no implicit cancel; a second question is refused (`btw_busy`, 409) exactly like the TUI. A new question is its own topic; only the panel's composer continues the active one.
- **State and streaming**: `btw_topics`/`btw_turns` in the chamber DB (schema in `src/server/lib/btw/schema.server.ts`; `thinking_level`/`approval_mode` are added by the additive column migration there, because `CREATE TABLE IF NOT EXISTS` leaves an existing table alone). The server is the source of truth and every frame is a snapshot (`btw_state`, carrying the live turn) or a delta (`btw_message` / `btw_activity`). Commands: `POST /api/btw/:sessionId` (`ask`/`abort`/`set_model`/`set_thinking_level`/`set_access_mode`/`dialog_response`/`promote`/`delete`), stream: `GET /api/btw/:sessionId/events` + WS `/:sessionId/ws`. Unlike the agent stream this one is NOT observer-only: history must be readable while no omp child is running, so reading the state also repairs `running` rows whose runtime is gone.
- **Promote** materializes the topic as a session of the chat's own: the copy is written beside the parent under a fresh id, carrying `parentSession` and a title slot padded to exactly the `SESSION_TITLE_SLOT_BYTES - 1` bytes omp rewrites in place, with the `<btw>` boilerplate unwrapped so the promoted chat shows the question the user actually asked. It is refused while a turn runs or once the parent transcript has moved past the snapshot's leaf (omp's own `/btw` branch guard).

### Terminal Panel (real PTY)
- The right-panel terminal is a **real shell on a pseudo-terminal**, not a command runner: `Bun.Terminal` + `Bun.spawn`, one shell per terminal id, N attached viewers. `src/server/lib/terminal/runtime.server.ts` owns the registry, `history.ts` the bounded scrollback, `shell.ts` the launch argv, and `src/server/routes/terminal/ws.ts` the socket. `GET /api/terminal/sessions` lists live shells; `GET /api/terminal/run` only supplies header context.
- **Transport is one WebSocket per terminal** (`/api/terminal/:terminalId/ws`): text frames are JSON control (`attach` / `resize` / `close`), binary frames are raw PTY bytes both ways. The frame contract lives in `src/shared/lib/workspace/terminal/protocol.ts` and is shared by both ends — change it there, never per side. Client pieces: `src/client/hooks/workspace/terminal/{index,socket}.ts` and `terminal-panel/RealtimeXtermView.tsx`.
- **Three invariants the runtime depends on** (each was verified against Bun 1.4.2 and each fails silently when broken): spawn with `detached: true` (otherwise the child sits in the server's process group — no job control, and a group signal would kill the chamber); launch POSIX shells through the `shellLaunch` shim that re-opens the PTY as the controlling terminal (`setsid` drops it, and a shell without one disables job control entirely); and send `SIGWINCH` after `term.resize()` (Bun updates the winsize but never signals the child, so a TUI would not repaint).
- **`SIGWINCH` must be debounced** (`resizeTerminalDebounced`). Every accepted grid change signals the shell, and a shell answers by redrawing its prompt — so a resize burst that reaches the PTY one-per-frame prints the prompt dozens of times (measured: 10 signals in one second for a single panel drag). A quiet period coalesces the burst to its trailing size. For the same reason the client suppresses `term.onResize` reports while it is laying out replayed scrollback: that transient grid is the recorded history's, not the panel's.
- Terminal ids are per chamber session (`terminal.id` in session UI state) so a page reload reattaches to the same shell and the server replays its scrollback. The replay is written at the size it was drawn for (`replayCols`/`replayRows`) and only then fitted — re-wrapping history at another width leaves fragments the shell's redraw never clears.
- A terminal has **one grid**, so with several viewers (two tabs, a phone and a desktop) the most recent `attach`/`resize` owns `cols`/`rows` and the others see output wrapped for it. That is inherent to sharing a PTY; there is no per-viewer size to fall back to.
- Do not reintroduce a per-command `sh -c` route or a client-side line editor: the shell owns line editing, history, completion and signals, and `xterm` must receive raw bytes (`onData` + `onBinary` out, `Uint8Array` in) so a character split across PTY reads stays intact.
- **The terminal font stack must keep its glyph fallbacks** (`XTERM_GLYPH_FALLBACKS` in `src/client/data/theme/terminal.ts`). Shell prompts are drawn with private-use symbols — powerline separators, devicons, Material Design icons — that no coding webfont contains: `@fontsource/fira-code`'s latin subset maps 226 codepoints, none above U+FFFF. Without a Nerd Font face in the chain the browser paints a hollow tofu box for every prompt segment. These are locally installed faces (a missing one is skipped by the normal fallback chain, so listing many is free) and they only supply glyphs the text face lacks, so Latin metrics are untouched. Note the two ways a local face can be referenced, because only one is reliable in Chrome: a **family name in the font stack works**, while `@font-face { src: local("…") }` matches the *full* or *PostScript* name only — `local("FiraCode Nerd Font Mono")` fails where `local("FiraCode Nerd Font Mono Reg")` and `local("FiraCodeNFM-Reg")` succeed. Bundling `SymbolsNerdFontMono` as a webfont (what OpenChamber does) would remove the dependency on the user's machine at ~1.1 MB.

### Right-Panel Repo Scope (Files / Search / Git / Terminal)
- The four right-panel views share one repo picker (`file-explorer/GitRepoDropdown.tsx` is presentational; the panel owns the data) and one scope hook, `src/client/hooks/workspace/repo-scope/`. A repo is a path **relative to the active workspace root** (`projects/jns6_5/token` only names a directory under `~/JatisMobile/Workspace`), so both the choice and the discovered list are meaningless without the root they belong to.
- **Every repo value is stored with its root, never bare.** `useRepoScope` persists `{ root, repo }` per session and reports `'.'` when the pick is not for the current root; the discovery store (`repo-scope/store.ts`) keys its snapshot by root. Bare values are what leaked: a workspace switch left the picker listing the previous workspace's repos and showing one of them as the selection, while every request named a path that did not exist under the new root. Storing the pairing invalidates by construction, so no reset effect has to be ordered against the per-session state restore — and a session returned to inside the same workspace keeps its repo.
- **Repo discovery is one shared store, not a fetch per panel.** `repo-scope/store.ts` owns the `?reposOnly=1` polling per root (the server discovers nested repos in the background and answers `reposPending`), so the four views issue one request per interval instead of four, and cannot disagree. It is injected with `fetch` and the retry scheduler, and `store.test.ts` covers the invalidation rules (a new root never reports the old list; a settled list is reused on re-subscribe; an unsettled scan is resumed; a failed read stays retryable; a response that lands after its root lost every subscriber is dropped).
- **`GET /api/fs/git` does NOT echo the repo back.** `repos` / `reposPending` / `activeRepo` travel only on the `?reposOnly=1` branch, keyed to the root they were discovered for. The status response used to echo `activeRepo`, and the git panel wrote that echo into its stored pick — so a repo the user never chose was adopted under whichever workspace was active when the response arrived. Resolve the fallback (first discovered repo when the root is not itself a repo) client-side in `resolveRepoForPanel` instead. Only git resolves it; Files/Search/Terminal keep `'.'` as the root itself, because browsing a workspace that is a folder of nested repos is legitimate.
- **Everything read for a scope is tagged with it and dropped when the scope moves.** The file listing carries its `root\0repo` (`Listing.scope`) and renders empty until the new root's read lands — its children cache and expansion set are keyed by paths relative to the listed root, so `src/` in one workspace would otherwise rehydrate into `src/` in the next. Search results carry their scope through `useSearchStream`, and the git panel gates `fetcher.data` on the scope the payload was requested for, so a switch never shows the old branch, changes or branch list under the new header.

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
- Every theme write goes through `applyDocumentTheme` (`src/client/hooks/ui/theme.ts`): it sets `<html data-theme>` and dispatches `omp:theme-changed`. Writing `document.documentElement.dataset.theme` directly leaves runtime consumers that cannot see CSS (the mermaid hydrator repaints diagrams per theme) on the previous palette.
- The only allowable chroma (outside of dark theme) is the signal red variable `var(--theme-error)` (`text-error`, `bg-error`) reserved for failures and error messages. Syntax highlighting is an explicit, user-approved exception: it is provided by Shiki with the dual-theme pair `one-light` (light themes) + `one-dark-pro` (dark themes). Token colors arrive as `--shiki-light` / `--shiki-dark` CSS variables on `.shiki` spans — consume them in `src/client/tailwind.css` under `[data-theme]`, never hardcode token hex, and never reintroduce `--syntax-*` variables or `.token.*` classes.

### Changelog Policy (Release-Only)
- **NEVER edit `CHANGELOG.md` during normal work** — not for a feature, a fix, a refactor, a typo, or a version-less "unreleased" note. A task ends at code plus the gates in rule 8; the changelog is not part of it.
- `CHANGELOG.md` is written **only when cutting a release**, and releases are cut by `.github/workflows/release.yml` on every push to `main` — so since `0.6.0` the file is written **by the pipeline, never by hand**: `release.config.mjs` derives each `## [x.y.z] — YYYY-MM-DD` section from the Conventional Commits since the last tag, above the previous release (newest first), carrying the `[Keep a Changelog](https://keepachangelog.com/en/1.1.0/)` categories that apply (`### Added`, `### Changed`, `### Fixed`, `### Removed`). The section order, the header and the leading `### BREAKING CHANGES` group are that config's `commitTypes` and `writerOpts`; a new category means editing both.
- New sections link their compare range **inline** (`## [0.6.0](…/compare/v0.5.0...v0.6.0) — …`) and their bullets are commit subjects, not the hand-written prose the sections before `0.6.0` use, so the `[x.y.z]:` reference block at the file's tail stops at the last hand-written release. Never add to, reword or reformat a section that already shipped — it describes what shipped, not what a later change adjusted.
- Write entries as released behavior: a bullet **is** the commit subject, so the subject carries the changelog — name the behavior that changed, never a restatement of the diff. A type marked `hidden` in `release.config.mjs` (`chore`, `style`, `test`, `build`, `ci`) appears nowhere and, because the analyzer runs `bumpStrict`, cannot cut a version on its own.
- A bullet credits its author — `… ([c148bc5](…)) (thanks [@octocat](https://github.com/octocat))` — unless that author is the repository owner, whose own commits carry the bulk of every release. `release/contributors.js` resolves the handle offline from GitHub privacy addresses (`NNN+login@users.noreply.github.com`) and asks the API about every other author, which is why the release job's `GITHUB_TOKEN` is what credits a contributor who commits with a real mailbox; bots (`[bot]` logins, `type: 'Bot'`) and unverified addresses get nothing, and a failed lookup never fails the release.

### Conventional Commit Type Selection
Every commit uses Conventional Commits — pick the type from what the diff actually does to observable behavior, not from how big it is:
- **`feat`** — new user-visible behavior: a feature, endpoint, setting option, or capability that did not exist before. A change that only reorganizes internals while the UI/API output stays identical is NOT a feat.
- **`fix`** — corrects existing behavior that was wrong: a bug, regression, wrong result, crash, or broken edge case. There must be a demonstrable "before was wrong" state; a behavior change that is merely a decision is not a fix.
- **`refactor`** — restructures code with zero external behavior change: renames, file moves/extractions, deduplication, type tightening, performance work with no visible effect.
- **`perf`** — the primary intent is a measurable performance improvement, with behavior unchanged.
- **`style`** — formatting/whitespace/import order only; no logic change. (`hidden` in `release.config.mjs`.)
- **`test`** — adds or repairs tests only; no production code change. (`hidden`.)
- **`build`** — toolchain, dependencies, build scripts (`package.json`, `rsbuild.config.ts`, `bun.lock`). (`hidden`.)
- **`ci`** — pipeline config only (`.github/workflows/`, `release.config.mjs`). (`hidden`.)
- **`chore`** — maintenance that fits none of the above (ignore files, secondary scripts). (`hidden`.)
- **`docs`** — documentation only (README, AGENTS.md, comments).
- **`BREAKING CHANGE`** — append `!` (`feat!:` / `fix!:`) and a footer when a change requires callers/users to act: removed/renamed API, route, setting, or a changed contract. The changelog's `### BREAKING CHANGES` group comes from this footer.
Mixed change in one commit: split into separate commits when the files are separable; if not, use the dominant type and note the rest in the body. The subject names the behavior that changed (it becomes a changelog bullet verbatim), the body explains the why/how — never restate the diff.

---

### GitHub Bot & Review Automation

`@ompchamber-bot` is a GitHub App plus the workflows in `.github/workflows/`; it triages every new issue and reviews every pull request. `CONTRIBUTING.md` is the contributor-facing half of this contract — read it before changing any of these files, because the two must tell the same story.

- **Writes go through the App, never `GITHUB_TOKEN`.** Every bot job mints an installation token from `BOT_APP_ID` + `BOT_APP_PRIVATE_KEY` (`actions/create-github-app-token`), so comments and labels come from `@ompchamber-bot` and cannot re-trigger a workflow that matches bot comments. Jobs are skipped outside `rajebdev/ompchamber`: a fork run has no App secret.
- **Command surface**, first line of a comment, exact match: `@<BOT_MENTION> help|review|summarize|triage|reproduce [focus]` (plus the `/oc-review` alias). `help` is answered without a model — it is a fixed string. The mention comes from the repository variable `BOT_MENTION` (default `ompchamber-bot`) rather than a literal, so an App whose slug differs still triggers: `bot-config-check.yml` is the one place that reads the App's real slug from its own installation token and reports the value to set.
- **The agent is the pinned `omp` CLI, run headless.** `.github/scripts/install-omp.sh` owns the version pin (`OMP_VERSION`); `.github/scripts/run-omp-bot.sh` runs `omp -p` with a persona file, a policy overlay, and the prompt on stdin. The runner needs `oven-sh/setup-bun`; `omp` is a Bun program.
- **Two provider modes, picked by whether `BOT_API_BASEURL` is set.** Unset: `BOT_MODEL` is a provider omp already knows and `BOT_API_KEY` is exported as the env var that provider reads (`BOT_API_KEY_ENV`, e.g. `DEEPSEEK_API_KEY`). Set: the model lives behind an OpenAI-compatible gateway, so the script declares a provider for the run from `.github/bot/provider-models.yml` and passes the key with `--api-key`. The second mode exists because omp ships no provider for an arbitrary base URL, and because **`--api-key` overrides the file's value while a `models.yml` `apiKey` cannot reference an environment variable** (`$VAR` and `${VAR}` are both literally true strings — verified against a local OpenAI-compatible stub) — so the template carries a placeholder and the real secret never touches the runner's disk. A thinking level (`BOT_THINKING`) only reaches the provider when the model entry declares `reasoning: true` — verified against the stub: without that line `--thinking` is accepted and silently dropped, with it a `--thinking high` run arrives as `reasoning_effort: "high"`. The template carries the line; a model's declared `efforts` may never include `off` (the schema rejects it, and omp clamps `off` up to the lowest listed effort). Repository settings: secret `BOT_API_KEY`; variables `BOT_MODEL`, `BOT_API_BASEURL` (optional), `BOT_API_KEY_ENV` (required only when `BOT_API_BASEURL` is unset), `BOT_THINKING` (optional, default `high`), `BOT_MENTION` (optional, default `ompchamber-bot`). The three provider settings are read from either store (`vars.X || secrets.X`), so a value placed in Secrets still works. **`BOT_MENTION` must be a variable**: every command trigger is a job condition, and a job condition may read `github`, `needs`, `vars` and `inputs` — never `secrets` — so a secret of that name is silently ignored and the default is used instead (`bot-config-check.yml` reports exactly that).
- **Policy is data, in the `.github/bot/*.yml` policy overlays.** `tools.approval.<tool>: deny` plus a `bash.patterns` allowlist ending in `- match: "*"` / `deny` gives a deny-by-default session; the reviewer cannot edit a file or run anything but `gh`, `git`, `rg`, `ls`, `cat`. **Never write `approval: prompt`**: there is no UI on a runner, so a prompt is a rejected call that reads to the model as a broken tool.
- **Procedure is versioned with the repository**, in `.omp/skills/{pr-review,issue-intake}/SKILL.md`, read by the agent through `skill://`. The persona files (`.github/bot/*.persona.md`) hold identity, guardrails and the exact output contract; the skills hold the steps. A 25 KB prompt never lives in a workflow.
- **Nothing downstream trusts the model.** `verify-review-verdict.sh` re-reads the posted comment from the API, requires the final line to be the marker `<!-- omc-review-meta {"head":"…","verdict":"…"} -->`, checks that the marker's HEAD equals the requested HEAD and is still the current one, that the human-readable verdict and reviewed-HEAD lines agree, and only then writes one `review:*` label. A mismatch fails the job and marks `review:automation-failed`; the verdict itself never fails a check. The human-readable checks read **values, not decoration** (backticks, bold, whitespace): a live run posted a correct review with every backtick stripped on the way to the API, and a gate stricter than the generator turns a finished review into a wasted run — the HEAD must still be named as a complete token, so tolerance applies to formatting and never to content.
- **Readiness is a label, not a comment**: `review:pending|ready|needs-evidence|blocked|human-required|automation-failed`. Exactly one at a time — `set-review-status.sh` is the only writer. Drafts carry none.
- **Trust boundary**: `pull_request_target` runs with secrets, so the base is what is checked out and the head is fetched as passive git data — never installed, built, or executed. A diff touching `AGENTS.md`, `CONTRIBUTING.md`, `.github/{workflows,scripts,bot,ISSUE_TEMPLATE}/**`, `.github/PULL_REQUEST_TEMPLATE.md` or `.omp/skills/**` is refused (`review:human-required`): automation must not clear a change to its own policy.
- **Logic lives in `.github/scripts/*.sh`, not in YAML.** Each script takes arguments and reads its state through `gh`, so it can be exercised locally against a stubbed `gh`; the workflow steps stay thin glue. When adding a gate, add it as a script.
- **Never put user content into a `run:` block through `${{ }}`** — title, body, comment text and focus go through `env:` and are read as shell variables. `run-omp-bot.sh` pipes the assembled prompt to `omp` on stdin for the same reason: no interpolation into shell text, no argument-quoting hazard.
- Editing any of these files is a `ci`-type change; the review-policy paths above mean the pull request that changes them will be marked `review:human-required` and must be read by a human.

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
  - `import { toTitleCase } from '@/shared/lib/chat/title-case';`
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
  - **CLI (`src/cli/`)**: The `ompchamber` command-line entry (`ompchamber.js`) and its `lib/` (arg parsing, process lifecycle, registry, serve/update/stop/restart/status/logs). These stay `.js` (plain ESM, no build step) and run under Bun via the `#!/usr/bin/env bun` shebang. `pkgRoot` is resolved two levels up from `src/cli/ompchamber.js`; keep that depth if the file ever moves.

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
  3. `find src -name "*.ts" -o -name "*.tsx" | xargs wc -l | grep -v total | awk '$1>350'` no file over 350 line codes
  4. Production build verification (`bun run build`).
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
- **Two width units, deliberately.** The **sidebar** is stored in **pixels** — it holds a session list, which does not get more useful on a wider monitor. The **editor and the right panel** are stored as a **share of the group's available area** (a fraction), because a pixel width is only right on the display it was dragged on. A slot may carry both; the fraction wins when the area is known, and the px value is what it renders at before then.
- **Sizes are px at the resizer boundary.** The hand-rolled resizer (`src/client/components/layout/desktop-layout/resizer/`) is px-only end to end: fixed panels get a px flex-basis and one filler panel absorbs the remainder. A fraction is resolved to px *before* it reaches a `Panel` — never pass a percentage string into `defaultSize`/`minSize`, because `toPx` parses it with `parseFloat` and `"45%"` would silently become 45px.
- **The panel ceiling is dynamic, not a constant.** `resolvePanelWidth` (`src/shared/lib/workspace/panel-widths.ts`) caps a panel at `available − chat floor − the other panels' floors − the handles' width`. A fixed ceiling either wastes a large monitor or eats the chat on a small one. The editor and the right panel compete for the same budget, so whichever renders first takes its share and the other gets the remainder.
- **One remembered width PER PANEL, never per group**: the sidebar, the editor panel (a separate width for source tabs and for diff tabs), and each of the eight right-panel views (`files`, `search`, `git`, `terminal`, `context`, `user-browser`, `browser`, `usage`) each own their width. The map and its slots live in `src/shared/lib/workspace/panel-widths.ts` (data) and `src/client/hooks/workspace/panel-widths.ts` (state); per-view fractions, px defaults, minimums, and the view list live in `src/shared/lib/workspace/right-panels.ts`. Sharing one number between panels — or resetting a panel to a hard-coded width when it is toggled or switched — is exactly the bug this shape exists to prevent.
- **Widths are per session.** They live in `session_ui_state` under `layout.panelWidths`, beside the rest of a session's layout state (`layout.activeRightPanel`, `layout.showRightPanel`, `layout.showLeftPanel`, `layout.userToggledEditor`, `layout.openedFiles`), so switching sessions restores the layout that session was left in. `app_settings.desktopLayoutSizes` is only the **seed** for a session that has never been resized — never write to it from a drag, or every session inherits the last one's layout.
- **A resize drag is deferred.** The separator moves a ghost guide line and re-applies the real width at most every `RESIZE_FOLLOW_INTERVAL_MS`; the panel's own 200ms width transition smooths the steps. Applying the width on every `pointermove` reflows an xterm buffer, a CodeMirror document and a browser iframe per frame, for a width the user is still choosing.
- **A collapsed panel stays mounted.** `Panel`'s `collapsed` prop renders it at zero width and marks it `data-panel-collapsed`, so its state (tree expansion, terminal buffer) survives and the width transition has something to animate. The separator walks past collapsed panels when it resolves its neighbours — pairing a drag against a zero-width panel whose registry floor still reads 320 clamps every delta to zero and kills the handle.
- **Restore through props, not imperative rebuilds**: every panel's `defaultSize` is derived from the remembered width for its current slot, and `Panel` adopts a changed `defaultSize` itself — that covers a right-panel view switch and an editor source↔diff switch, both of which keep the panel mounted while only its width slot changes. No layout cache exists to go stale. Append an entry here if a new resizable group is introduced.

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

