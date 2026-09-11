/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * On-disk subagent history recovery for oh-my-pi sessions.
 *
 * omp writes each subagent's transcript to the PARENT session's sibling
 * artifacts directory: `<session-dir>/<subagent-id>.jsonl`. The parent's task
 * toolResult `details` persist `progress` (running snapshots) and `results`
 * (settled telemetry), so the roster survives a reload without the live RPC
 * registry — which only knows currently-running subagents.
 *
 * Ported from omp-web/lib/subagent-history.ts; byte-window transcript paging
 * lives in `@/lib/omp/subagent/history-transcript`.
 */

import { existsSync, readFileSync, statSync } from 'fs';
import { basename, dirname, join } from 'path';
import { parseJsonlLenient } from '@/lib/omp/session/jsonl';
import { isRecord } from '@/lib/omp/session/parse-message-blocks';
import { parseSubagentProgress } from '@/lib/omp/subagent/parse';
import {
  asAgentSource,
  asNumber,
  asString,
  taskResultStructuredOutput,
  taskResultUsageCost,
} from '@/lib/omp/subagent/result-details';
import type { OmpMessageEntry } from '@/lib/omp/session/messages-parse';
import type { SubagentHistoryEntry, SubagentHistoryResult } from '@/types/omp/subagent';

/** Byte cap on the parent session file parsed for history (chat reload cap). */
const MAX_HISTORY_SESSION_BYTES = 512 * 1024 * 1024;

/** Subagent ids are AdjectiveNoun names, dotted for nested spawns. The grammar
 *  bounds session-content-derived ids before they are joined into a path. */
export const SUBAGENT_ID_RE = /^[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*$/;
export const SUBAGENT_ID_MAX_LENGTH = 100;

/** Sibling artifacts directory for a parent session file. */
export function siblingDirForSession(sessionFilePath: string): string {
  return join(dirname(sessionFilePath), basename(sessionFilePath, '.jsonl'));
}

/** Subagent transcript path for a roster id within a parent session. */
export function subagentTranscriptPath(sessionFilePath: string, subagentId: string): string {
  return join(siblingDirForSession(sessionFilePath), `${subagentId}.jsonl`);
}

function progressStatusToHistory(status: string | undefined): SubagentHistoryEntry['status'] {
  if (status === 'completed') return 'completed';
  if (status === 'failed') return 'failed';
  if (status === 'aborted') return 'aborted';
  return 'started';
}

function resultStatus(value: Record<string, unknown>): SubagentHistoryEntry['status'] {
  if (value.aborted === true) return 'aborted';
  if (typeof value.error === 'string' && value.error) return 'failed';
  if (typeof value.exitCode === 'number') return value.exitCode === 0 ? 'completed' : 'failed';
  return 'started';
}

/** True when an entry already carries a settled state that a stale/duplicate
 *  progress snapshot must not regress (unknown/running → "started"). */
function progressUpsertBlocked(existing: SubagentHistoryEntry): boolean {
  return existing.result !== undefined
    || existing.status === 'completed'
    || existing.status === 'failed'
    || existing.status === 'aborted';
}

/** Read + lenient-parse every JSONL entry of a session file (bounded). */
function loadSessionEntries(sessionFilePath: string): OmpMessageEntry[] {
  try {
    if (statSync(sessionFilePath).size > MAX_HISTORY_SESSION_BYTES) return [];
  } catch {
    return [];
  }
  try {
    return parseJsonlLenient<OmpMessageEntry>(readFileSync(sessionFilePath, 'utf8'));
  } catch {
    return [];
  }
}

/**
 * Recover the subagent roster from a parent session file. Walks task
 * toolResults, merging `progress` (live-snapshot fields) with `results`
 * (settled per-subagent telemetry), then resolves sibling transcript files.
 */
export function extractSubagentHistory(sessionFilePath: string): SubagentHistoryEntry[] {
  const entries = loadSessionEntries(sessionFilePath);
  if (entries.length === 0) return [];

  const byId = new Map<string, SubagentHistoryEntry>();
  // Authoritative launch order: the assistant message that spawns a batch lists
  // its `task` toolCall blocks in the order the model issued them. Ordering by
  // toolResult arrival instead would misplace parallel calls, whose results are
  // appended as each one finishes rather than as each one started.
  const callOrder = new Map<string, number>();
  for (const entry of entries) {
    const message = entry.message;
    if (entry.type !== 'message' || !message || message.role !== 'assistant') continue;
    const content = message.content;
    if (!Array.isArray(content)) continue;
    for (const block of content) {
      if (!isRecord(block) || block.type !== 'toolCall' || block.name !== 'task') continue;
      const callId = asString(block.id);
      if (callId !== undefined && !callOrder.has(callId)) callOrder.set(callId, callOrder.size);
    }
  }

  // `index` is the position inside ONE `task` call's batch and restarts at 0 for
  // every call, so sorting by it alone interleaves the agents of separate calls.
  // Pair it with the ordinal of the call that spawned each agent.
  const batchSeqById = new Map<string, number>();
  let batchSeq = -1;
  let unannouncedCalls = 0;
  const upsert = (entry: SubagentHistoryEntry, options?: { ignoreTerminal?: boolean }): void => {
    if (!SUBAGENT_ID_RE.test(entry.id)) return;
    const existing = byId.get(entry.id);
    if (!existing) {
      batchSeqById.set(entry.id, batchSeq);
      byId.set(entry.id, entry);
      return;
    }
    // A stale/duplicate progress snapshot must not regress a settled agent:
    // once a result is recorded (or status went terminal via results), skip
    // the whole overwrite. `ignoreTerminal` opts the results loop out — its
    // own field-by-field guards already make it authoritative.
    if (!options?.ignoreTerminal && progressUpsertBlocked(existing)) return;
    const preservedBatchSeq = batchSeqById.get(entry.id) ?? batchSeq;
    batchSeqById.set(entry.id, preservedBatchSeq);
    byId.set(entry.id, {
      ...existing,
      ...entry,
      parentToolCallId: entry.parentToolCallId ?? existing.parentToolCallId,
      batchSeq: preservedBatchSeq,
      result: entry.result ?? existing.result,
    });
  };

  // Detached async spawns — jobIds collected in the same pass below.
  const detachedIds = new Set<string>();
  for (const entry of entries) {
    const message = entry.message;
    if (entry.type !== 'message' || !message || message.role !== 'toolResult') continue;
    if (message.toolName !== 'task') continue;
    const toolCallId = asString(message.toolCallId);
    // A result whose call block never made it into the file (truncated or
    // imported session) keeps arrival order, placed after every announced call.
    const announced = toolCallId !== undefined ? callOrder.get(toolCallId) : undefined;
    batchSeq = announced ?? callOrder.size + unannouncedCalls++;
    const details: Record<string, unknown> = isRecord(message.details) ? message.details : {};
    const progressArr = Array.isArray(details.progress) ? details.progress : [];
    const resultsArr = Array.isArray(details.results) ? details.results : [];
    const asyncInfo = isRecord(details.async) ? details.async : undefined;
    const asyncJobId = asyncInfo ? asString(asyncInfo.jobId) : undefined;
    if (asyncJobId) detachedIds.add(asyncJobId);

    for (const raw of progressArr) {
      const progress = parseSubagentProgress(raw);
      if (!progress?.id) continue;
      upsert({
        id: progress.id,
        agent: progress.agent ?? 'subagent',
        agentSource: progress.agentSource,
        status: progressStatusToHistory(progress.status),
        task: progress.task,
        assignment: progress.assignment,
        description: progress.description,
        index: progress.index ?? 0,
        ...(toolCallId !== undefined ? { parentToolCallId: toolCallId } : {}),
        lastIntent: progress.lastIntent,
        toolCount: progress.toolCount,
        requests: progress.requests,
        tokens: progress.tokens,
        contextTokens: progress.contextTokens,
        contextWindow: progress.contextWindow,
        cost: progress.cost,
        durationMs: progress.durationMs,
        modelOverride: progress.modelOverride,
        modelRole: progress.modelRole,
        resolvedModel: progress.resolvedModel,
        resolvedModelIsFallback: progress.resolvedModelIsFallback,
        retryFailure: progress.retryFailure,
        transcriptAvailable: false,
      });
    }

    for (const raw of resultsArr) {
      if (!isRecord(raw)) continue;
      const id = asString(raw.id);
      if (!id) continue;
      const prior = byId.get(id);
      const result: SubagentHistoryResult = {};
      const exitCode = asNumber(raw.exitCode);
      if (exitCode !== undefined) result.exitCode = exitCode;
      // NOTE: `output`/`stderr` are deliberately NOT copied — the roster route
      // must stay telemetry-only (task outputs can be ~500KB per agent).
      if (raw.truncated === true) result.truncated = true;
      const cost = asNumber(raw.cost) ?? taskResultUsageCost(raw.usage);
      if (cost !== undefined) result.cost = cost;
      const structured = taskResultStructuredOutput(raw.structuredOutput);
      if (structured !== undefined) result.structuredOutput = structured;
      const error = asString(raw.error);
      if (error !== undefined) result.error = error;
      if (raw.aborted === true) result.aborted = true;
      const abortReason = asString(raw.abortReason);
      if (abortReason !== undefined) result.abortReason = abortReason;
      const outputPath = asString(raw.outputPath);
      if (outputPath !== undefined) result.outputPath = outputPath;
      const patchPath = asString(raw.patchPath);
      if (patchPath !== undefined) result.patchPath = patchPath;
      const branchName = asString(raw.branchName);
      if (branchName !== undefined) result.branchName = branchName;
      let retryFailure = prior?.retryFailure;
      const retryRaw = raw.retryFailure;
      if (isRecord(retryRaw)) {
        const attempt = asNumber(retryRaw.attempt);
        const errorMessage = asString(retryRaw.errorMessage);
        if (attempt !== undefined && errorMessage !== undefined) retryFailure = { attempt, errorMessage };
      }
      const modelOverride = typeof raw.modelOverride === 'string'
        ? raw.modelOverride
        : Array.isArray(raw.modelOverride) && raw.modelOverride.every((model): model is string => typeof model === 'string')
          ? raw.modelOverride
          : prior?.modelOverride;
      upsert({
        id,
        agent: asString(raw.agent) ?? prior?.agent ?? 'subagent',
        agentSource: asAgentSource(raw.agentSource) ?? prior?.agentSource,
        status: resultStatus(raw),
        task: asString(raw.task) ?? prior?.task,
        assignment: asString(raw.assignment) ?? prior?.assignment,
        description: asString(raw.description) ?? prior?.description,
        index: asNumber(raw.index) ?? prior?.index ?? 0,
        ...(toolCallId !== undefined ? { parentToolCallId: toolCallId } : {}),
        lastIntent: asString(raw.lastIntent) ?? prior?.lastIntent,
        toolCount: asNumber(raw.toolCount) ?? prior?.toolCount,
        requests: asNumber(raw.requests) ?? prior?.requests,
        tokens: asNumber(raw.tokens) ?? prior?.tokens,
        contextTokens: asNumber(raw.contextTokens) ?? prior?.contextTokens,
        contextWindow: asNumber(raw.contextWindow) ?? prior?.contextWindow,
        cost: asNumber(raw.cost) ?? taskResultUsageCost(raw.usage) ?? prior?.cost,
        durationMs: asNumber(raw.durationMs) ?? prior?.durationMs,
        modelOverride,
        modelRole: asString(raw.modelRole) ?? prior?.modelRole,
        resolvedModel: asString(raw.resolvedModel) ?? prior?.resolvedModel,
        resolvedModelIsFallback: typeof raw.resolvedModelIsFallback === 'boolean'
          ? raw.resolvedModelIsFallback
          : prior?.resolvedModelIsFallback,
        retryFailure,
        transcriptAvailable: false,
        result: Object.keys(result).length > 0 ? result : undefined,
      }, { ignoreTerminal: true });
    }

    // Detached async spawns can persist with an empty results[] while still
    // running — async.jobId still names the agent.
    if (asyncInfo) {
      const jobId = asString(asyncInfo.jobId);
      if (jobId && !byId.has(jobId)) {
        upsert({
          id: jobId,
          agent: 'task',
          status: asyncInfo.state === 'completed' ? 'completed' : asyncInfo.state === 'failed' ? 'failed' : 'started',
          index: byId.size,
          ...(toolCallId !== undefined ? { parentToolCallId: toolCallId } : {}),
          transcriptAvailable: false,
        }, { ignoreTerminal: true });
      }
    }
  }

  // Resolve sibling transcript files and detached markers.
  const dir = siblingDirForSession(sessionFilePath);
  const roster = [...byId.values()];
  for (const entry of roster) {
    // The client cannot derive this: neither a live snapshot nor a partial
    // history fetch reveals which call came first.
    entry.batchSeq = batchSeqById.get(entry.id) ?? 0;
    if (detachedIds.has(entry.id)) entry.detached = true;
    if (!SUBAGENT_ID_RE.test(entry.id)) continue;
    // Guard against crafted ids probing outside the sibling dir (e.g. "../");
    // the path is derived from untrusted session content.
    const candidate = join(dir, `${entry.id}.jsonl`);
    if (existsSync(candidate)) {
      entry.sessionFile = candidate;
      entry.transcriptAvailable = true;
    }
  }
  return roster.sort((a, b) =>
    (batchSeqById.get(a.id) ?? 0) - (batchSeqById.get(b.id) ?? 0)
    || a.index - b.index
    || a.id.localeCompare(b.id),
  );
}
