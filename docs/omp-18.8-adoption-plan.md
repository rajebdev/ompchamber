# omp 18.8 adoption plan

The chamber pinned `OMP_VERSION=18.3.0` in `.github/scripts/install-omp.sh` while
the installed binary was **18.8.3** (2026-10-07); the pin now matches (F9). This document records the audit
of everything between the two versions that the chamber either gets wrong or
does not use, and the phased plan to close it.

Status: **complete**. Phase table and per-phase outcomes below; P4b–d and P5 were
measured and deliberately NOT adopted (see the outcomes).

## How this audit was produced

Every claim below was measured, not read off a changelog:

- Release notes for v18.1.22 → v18.8.3 (`api.github.com/repos/can1357/oh-my-pi/releases`).
- The machine-readable wire schema shipped in the installed package
  (`@oh-my-pi/pi-coding-agent/src/modes/rpc/wire/rpc-wire.schema.json`): **67
  commands**, 31 session events, 20 notifications, 4 inbound frames.
- The settings registry in the installed bundle
  (`@oh-my-pi/pi-coding-agent/dist/cli.js`, `SETTING_TABS` from `pi-tui`):
  **537 live config keys**.
- Live RPC probes against `omp --mode rpc-ui` 18.8.3 (and, for the partial-result
  question, against a freshly installed 18.3.0 to prove it is not a regression).

## Findings

### F1 — Tool output is double-appended (bug, shipped)

`tool_execution_update.partialResult` is a **full snapshot** of the tool's output
so far, never a delta. The chamber appends:

```ts
// src/shared/lib/chat/omp/agent-events.ts:143-146
const prev = deps.toolResultsRef.current?.get(callId)?.output ?? '';
putToolResult(deps, callId, { output: prev + partial });   // WRONG
```

Measured on omp 18.8.3, a `bash` loop echoing `L1…L4` one line per second:

```
update 0: "L1\n"
update 1: "L1\nL2\n"     ← full snapshot
update 2: "L1\nL2\nL3\n"
```

The same probe against **18.3.0** produced identical output, so this is not a
regression introduced by the upgrade — it has always been wrong.

Consequence: a tool card that is **still running** renders interleaved text
(`"L1\nL1\nL2\nL1\nL2\nL3\n"`). `tool_execution_end` overwrites the record with
the real result, so the corruption self-heals the moment the call returns — but
every long-running command (a build, a test run, a `sleep`) is wrong for its
whole duration.

Fix: assign the snapshot instead of appending.

### F2 — Settings schema is frozen at 2026-09-18

`src/client/data/settings/omp-schema.json` was last touched by the Remix→Elysia
migration commit `77d9199` and has never been regenerated. Consequences:

- **157 live omp settings cannot be rendered at all**, including every
  `title.*`, `tui.renderSvg`, `tui.autoGraph`, `task.completionProbe`,
  `skills.*`, `ida.*`, `searxng.*`, `gc.*`, `memories.*`,
  `compaction.v2RetainedMessageBudget`, `browser.tern`, `stream.serverUrl`,
  `telemetry.otlpExportEnabled` and `auth.broker.*`.
- **12 keys the chamber still offers are rejected by omp** — verified one by one
  with `omp config get <key>` → `Unknown setting: <key>`:

  `irc.timeoutMs`, `providers.autoThinkingModel`, `providers.imageOrder`,
  `providers.memoryModel`, `providers.tinyModel`, `providers.tts`,
  `providers.unexpectedStopModel`, `providers.webSearchExclude`,
  `providers.webSearchGeminiModel`, `providers.webSearchOrder`,
  `stt.modelName`, `tts.localModel`.

  These render an editor whose write is guaranteed to fail — a settings row that
  cannot work.
- `task.completionProbeMs` was **replaced** by the on/off `task.completionProbe`
  in 18.5.0.

Fix: generate the JSON from the installed bundle with a committed script, so the
next upgrade is one command.

### F3 — 100× avoidable transport cost

`set_event_filter` with `messageUpdates: "delta"` makes omp send
`message_update` frames carrying only the new fragment
(`assistantMessageEvent.delta`) instead of the accumulated `message` +
`assistantMessageEvent.partial` snapshot on every token.

Measured on one prompt (`Write a 300 word essay about rain.`):

| mode | bytes | frames |
|---|---|---|
| default (accumulated) | 10,908,455 | 2,217 |
| `messageUpdates: "delta"` | 107,943 | 486 |

~101× fewer bytes. The chamber never calls `set_event_filter` and reads the
accumulated `partial`, so it pays the full cost.

Terminal frames stay whole in delta mode (verified): `message_end`, `turn_end`
and `agent_end` still carry the complete message, so the fix is confined to the
in-flight rendering path.

### F4 — omp now implements, natively, three things the chamber reimplemented

| Area | omp RPC | Chamber today |
|---|---|---|
| Side questions | `btw` / `btw_cancel` / `get_btw_history`, streamed as `btw_delta` + `btw_record`, works mid-turn | own child: `--resume <snapshot> --no-tools` |
| Follow-up queue | `get_state.queuedMessages`, `queue_update`, `remove_queued_message`, `promote_queued_message`, `abort_and_restore_queue` | own SQLite `queued_messages` + drain on `agent_end` |
| Steering | `steer` (interrupt the turn with a message) | `abort_and_prompt` — **cancels the turn** |

Measured: `steer` mid-turn answers `success: true`, emits
`queue_update {steering:[…]}` then `{steering:[]}` when consumed, and the model
responds to the steer inside the same run (one `agent_start`, one `agent_end`).

The chamber's queue row labelled **"Send Now (Steering)"** actually posts
`abort_and_prompt`, which discards the running turn. omp has had real steering
since 18.3.x.

### F5 — Unused surface (no chamber code path)

Verified zero references in `src/`:

`set_event_filter`, `queue_update`, `queuedMessages`, `abort_and_restore_queue`,
`remove_queued_message`, `promote_queued_message`,
`get_available_thinking_levels`, `get_session_stats`, `export_html`,
`cancel_subagent`, `steer_subagent`, `set_slow_mode`, `set_cache_warming`,
`set_ask_dialog`, `get_logout_accounts`, `predict_word`, `session_settled`,
`tool_stream_update`, `cache_warming_*`, `retry_fallback_*`,
`config_warnings_changed`, `rpc_frame_error`, `extension_error`.

Frames that arrive today fall through `default: break` in both folds.

### F6 — Provider "disconnect" does not remove the credential

`POST /api/settings/providers` `{enabled:false}` writes
`disabledProviders` in `config.yml`. The OAuth token / API key stays in the auth
store. omp exposes `get_logout_accounts` + `logout` for the real operation, and
the chamber never calls them.

### F7 — Grouped ask dialog available

`set_ask_dialog {enabled:true}` makes omp send **one** `extension_ui_request`
with `method:"ask"` carrying every question of a call (with `multi` and
`recommended`), answered by a single `AnswersUiResponse`. Verified live: two
questions including a `multi:true` one arrived in one request.

Today the chamber renders one dialog per question because omp's default mode
asks one at a time.

### F8 — Verified NOT broken (do not "fix")

- **TUI-only guard is correct.** All 42 names in
  `src/shared/lib/chat/composer/tui-only.ts` are still `handleTui`-only in
  18.8.3. `plan`/`goal` are deliberately absent (the chamber's own extension
  answers them). The extracted list from 18.8.3 is exactly those 42 plus
  `goal`/`plan` — no drift.
- **`get_state.isSettled` is already used** (`run-settle.server.ts`).
- **STT audio type is correct.** The worker takes `Float32Array` at 16 kHz and
  rejects everything else; `src/server/routes/dictation/ws.ts` converts PCM16 →
  `Float32Array` before `transcribe`. The comment in `omp-stt-worker.ts` saying
  "base64" is **doc drift** in the chamber, not a code bug.
- **`turn_end` is deliberately unhandled** — it fires for every turn of a
  multi-turn run, and `terminal-settle.ts` reads the badge from it. Not a gap.
- **`tool_stream_update` never fires** in practice on 18.8.3 for `bash` or
  `write` (measured: 0 frames on both). It is an extension-tool channel
  (`updateStreamPreview` in the TUI), not something the chamber is missing.

### F9 — Pinned version was stale

`.github/scripts/install-omp.sh` pinned `18.3.0` while the audited version is
`18.8.3`, so the CI bot ran a build predating every RPC feature this document is
about (`steer`, `set_event_filter`, `get_state.isSettled`). **Fixed**: the pin is
now `18.8.3`.

## Phases

Each phase is independently shippable. Verification is named per phase; a phase
is done only when its verification has been run.

| # | Phase | Deliverable | Verification |
|---|---|---|---|
| P1 | Tool partial snapshot | assign, not append | unit test + live tool card |
| P2 | Settings schema | regenerated JSON + committed generator | every key accepted by `omp config get` |
| P3 | Delta transport | `set_event_filter` at attach + delta fold | byte/frame comparison, rendered answer identical |
| P4 | Native queue & steer | Send Now steers; queue read from `queue_update` | steer mid-turn observed; queue ops round-trip |
| P5 | Native /btw | RPC `btw` path | side question answered mid-turn; parent file unchanged |
| P6 | Subagent + session ops | cancel/steer subagent, session stats, live thinking levels | live subagent cancelled from the roster |
| P7 | Provider logout | credential removal beside disable | account list → logout → account gone |
| P8 | Grouped ask | one request, multi-select | two-question ask answered in one submit |
| P9 | Frames & hygiene | unknown-frame handling, version pin, AGENTS.md | typecheck + full suite + live boot |

## Phase outcomes

### P1 — tool output snapshot (shipped)

`agent-events.ts` assigned the snapshot instead of appending. Regression test in
`agent-events.test.ts`, and a replay of a real 114-frame capture confirmed the
running card never doubles.

### P2 — settings schema (shipped)

`scripts/omp-schema.mjs` + `bun run omp:schema` / `omp:schema:check`. The JSON
went from 377 entries (12 of them rejected by omp) to **404 entries, 0 rejected**,
and every key was checked against `omp config get`. `omp:schema:check` is the CI
gate.

### P3 — delta transport (shipped)

`configureChild` sends `set_event_filter {messageUpdates:"delta"}` and
`delta-accumulator.ts` rebuilds the accumulated message. Measured on one
500-word prompt: **8.4 MB / 1268 frames → 165 KB / 824 frames (51×)**. Verified
end to end through the real server path: the streamed text matched the persisted
transcript byte for byte, one row, no duplication.

### P4a — real steering (shipped)

Send Now posts `steer`, not `abort_and_prompt`. Measured: `steer` keeps one
`agent_start`/`agent_end` pair for the run; `abort_and_prompt` produced two of
each. The now-dead `interruptPendingRef` guard was removed.

### P4b–d — native queue: NOT ADOPTED (measured)

**omp's follow-up queue is in-memory and belongs to the child process.** Measured:
a `follow_up` item present in `get_state.queuedMessages` before the child was
killed was **gone after a respawn** on the same session file. The chamber's queue
is SQLite-backed (`queued_messages`) and therefore survives an idle reclaim, a
server restart and a second chamber instance — three things that happen routinely
and would silently drop a user's queued message under omp's queue. The chamber
also never populates omp's queue (zero `follow_up` sends), so the two are
disjoint rather than duplicated.

Adopting `remove_queued_message` / `promote_queued_message` /
`abort_and_restore_queue` would mean routing the panel's queue through a store
that loses its contents on the next child restart. The chamber's own per-item
queue endpoints already provide the equivalent operations durably.

What IS taken from this area is P4a: real `steer` for "Send Now".

### P5 — native /btw: NOT ADOPTED (measured)

Same finding, same reason. Measured: `get_btw_history` returned a record before
the child was killed and **`{records:[]}` after a respawn**. The chamber's BTW
topics live in SQLite (`btw_topics`/`btw_turns`) and survive restarts; omp's
history is per-process. The chamber's side child additionally resumes a
transcript COPY (`--no-tools`), which is what keeps the parent session file
untouched and lets a topic outlive any single child.

Adopting RPC `btw` would trade durable, restorable topics for ones that vanish
when the idle reaper reclaims the child.

### P6 — subagent control (shipped), session ops (not adopted)

`cancel_subagent` / `steer_subagent` are wired end to end: routes
(`sessions/subagent-control.ts`), the passthrough set, a client module, a control
strip on the subagent transcript, and a stop button on the roster row. Verified
against omp 18.8.3: `get_subagents` reports the roster id (`Sleeper`), and both
commands answered `success: true` for it.

Not adopted, with the evidence:

- **`get_session_stats`** duplicates what the chamber already has. Measured side
  by side: `get_session_stats.tokens` = `{input: 8843, output: 25, total: 8868}`
  and `cost: 0.001482…`, while the `message_end` frame the timeline already folds
  carried `usage.totalTokens: 8868` and `usage.cost.total: 0.001482…` — the same
  numbers. Adding a second source for the footer would only create a way for the
  two to disagree.
- **`get_available_thinking_levels`** duplicates `get_state.model.thinking.efforts`
  (measured: `["low","high","max"]`), which `thinkingLevelsForMeta` already turns
  into the same ladder the command returns (`["off","low","high","max"]`). The
  chamber reads the live ladder from `get_state`, so the command adds a round
  trip for an identical list.

### P7 — provider logout (shipped)

`POST /api/settings/providers/logout` drives omp's `get_logout_accounts` and
`logout`; `LogoutProviderModal` lists the removable credentials and removes one;
a `sign out` button sits beside `disable`/`connect` in the auth section. The two
operations are now visibly different: `disable`/`disconnect` hide a provider and
leave the credential, `sign out` deletes it. The dialog says what survives (a
`models.yml` entry, the chamber overlay) so the distinction is not implied.

### P8 — grouped ask (shipped)

`configureChild` sends `set_ask_dialog {enabled:true}`; the frame's `questions`
are typed on `ExtensionUiDialogRequest`; `splitAskFrames` claims the grouped
frame by question id (it carries no `title`) and places it on every question it
names; `GroupedAsk` renders all questions with one `Submit answers` and replies
with a single `{answers:[…]}`. Tests: `ask-frames-grouped.test.ts`.

### P9 — frames & hygiene (shipped)

`transport-frames.ts` folds `rpc_frame_error`, `extension_error` and
`session_settled`, and names the frames deliberately ignored. `OMP_VERSION` is
pinned to `18.8.3`. AGENTS.md carries the delta transport, the transport frames,
the steering rule and the generated settings schema; the STT audio doc drift
(base64 → `Float32Array`) is corrected.

## Non-goals

- No `--mode json`, ACP, or live-voice (`live_start`) support.
- No `predict_word` ghost text (the chamber's composer has no completion surface).
- No `export_html`.
- `get_entries` / `get_tree` / `get_branch_messages` are read-only tree views the
  chamber has no UI for; noted, not adopted.
