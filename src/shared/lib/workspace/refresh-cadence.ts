/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Single source of truth for every refresh/poll cadence in the chamber.
 *
 * These values used to live next to their hooks (sidebar idle, stream poll,
 * revalidation throttle, panel poll, git status, repo discovery, CDP poll,
 * server-side dataset TTL, spawn retry backoff). Scattering them made tuning a
 * cross-file hunt and let related numbers drift apart — the sidebar's 5s poll
 * sitting exactly on the server's 5s TTL was the clearest case: a poll landing
 * on the TTL boundary is a coin flip between a cache hit and a full disk scan.
 *
 * Keep every cadence here so the cost/freshness trade-off can be reasoned
 * about in one place. Imported by client hooks, shared browser modules, and
 * server routes alike — this module must stay free of `node:`/`Bun.*` imports.
 */

/**
 * Sidebar idle keep-alive. The event paths (`omp:session-updated`) and the
 * stream poll only fire while THIS client is active, so changes made elsewhere
 * — a second tab, a background omp process finishing, an archive from another
 * browser — would never surface. A slow poll closes that gap.
 *
 * 30s: the payload costs a per-session filesystem probe server-side
 * (`sessionHasSubagents`), and idle means the user is not running anything
 * here, so a half-minute of staleness is imperceptible.
 */
export const SIDEBAR_IDLE_REFRESH_MS = 30_000;

/**
 * Sidebar poll while some session is streaming. This is the belt to the
 * `omp:session-updated` suspenders: when a background run finishes while the
 * user sits on another session, no event is dispatched on this client, so only
 * a timer can notice.
 *
 * 8s: the thing being waited for is a one-shot "done" badge, where a few
 * seconds of latency is invisible — 5s was buying nothing.
 */
export const SIDEBAR_STREAM_POLL_MS = 8_000;

/**
 * Coalescing window for sidebar revalidation, applied as a LEADING + TRAILING
 * throttle: the first event revalidates immediately, further events inside the
 * window collapse into one trailing call.
 *
 * Leading-edge matters: `omp:session-updated` arrives in bursts (spawn, JSONL
 * write, agent end), and a pure trailing debounce starves under a sustained
 * burst — a 500ms retry loop would reset the timer forever and the sidebar
 * would never refresh. Capping at one fetch per second keeps a busy run cheap
 * without the starvation.
 */
export const SIDEBAR_REVALIDATE_THROTTLE_MS = 1_000;

/**
 * Right-panel poll cadence (context, usage, files, git). Panels mount only
 * while active and each already has an event-driven companion
 * (`useFileMutationRefresh`) for agent edits, so this poll only covers
 * out-of-band changes — 5s is plenty. The git panel is the expensive one: each
 * tick spawns git status, and at 2s that was the heaviest poll in the app.
 */
export const PANEL_REFRESH_MS = 5_000;

/**
 * Coalescing window after a file-mutating tool completes. Event-driven, not a
 * poll — a burst of quick edits should collapse into one re-read.
 */
export const FILE_MUTATION_THROTTLE_MS = 500;

/**
 * Git-status poll behind the activity-bar / mobile "uncommitted changes"
 * indicator. Already visibility- and focus-gated, and now also refreshed by
 * the `omp:session-updated` / `omp:workspace-updated` events.
 */
export const GIT_STATUS_POLL_MS = 15_000;

/**
 * Coalescing window for the event-driven git-status re-read. A single agent run
 * emits `omp:session-updated` more than once (run start, settled JSONL read,
 * run end) and every `useGitStatus` instance listens, so an uncoalesced trigger
 * would spawn several `git status` processes per run — the exact cost the poll
 * cadence was raised to avoid. Trailing-only on purpose: the tree only settles
 * after the run's writes land, so there is nothing worth reading on the leading
 * edge.
 */
export const GIT_STATUS_EVENT_THROTTLE_MS = 1_000;

/**
 * Nested-repo discovery poll (`?reposOnly=1`). Short-lived: it stops as soon
 * as discovery settles, so a tight cadence only costs a few requests.
 */
export const REPO_DISCOVERY_POLL_MS = 1_500;

/**
 * CDP state/screencast poll. Latency-sensitive — the browser panel streams a
 * live page, so this one stays tight on purpose.
 */
export const BROWSER_POLL_MS = 1_000;

/**
 * Keep-alive comment frame for long-lived SSE/WS transports (agent bridge and
 * browser stream). Not a data refresh — it keeps proxies from reaping an idle
 * connection.
 */
export const STREAM_HEARTBEAT_MS = 30_000;

/**
 * TTL for the server-side sidebar dataset scan (`loadOmpSidebarData`). Kept
 * just UNDER the fastest sidebar poll (8s) so a poll deterministically misses
 * and triggers exactly one scan instead of racing the boundary.
 */
export const SIDEBAR_DATA_TTL_MS = 4_000;

/**
 * Retry backoff (ms) used while waiting for a freshly spawned omp session's
 * JSONL to carry the user turn. Each entry is the delay BEFORE the next
 * attempt; attempt 1 runs immediately, so the total attempt count is
 * `length + 1` and the elapsed budget is the sum (~15.5s over 13 attempts).
 *
 * Front-loaded on purpose: omp usually writes the turn within a second, so the
 * early 250ms probes land the real title fast, while the 2s tail keeps watching
 * a slow spawn without spending 40 requests to do it.
 */
export const SESSION_META_RETRY_SCHEDULE_MS: readonly number[] = [
  250, 250, 500, 500, 1_000, 1_000, 2_000, 2_000, 2_000, 2_000, 2_000, 2_000,
];
