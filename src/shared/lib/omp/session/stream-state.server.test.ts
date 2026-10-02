/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The staleness rule behind the sidebar's self-heal. Getting it wrong is
 * user-visible in both directions: too eager clears the spinner of a run that
 * is still working, too lazy leaves a spinner turning forever for a run whose
 * process is gone.
 *
 * The rule is deliberately a pure function of the ROW plus OS liveness, with no
 * caller context. That is what makes several chamber instances agree: they all
 * read the same row and ask the same question about the same pid.
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  isOrphanStreamRow,
  isStaleStreamRow,
  loadStreamStates,
  loadStreamStatuses,
  markStreamModel,
  markStreamStatus,
} from '@/shared/lib/omp/session/stream-state.server';

const OWNER = 4242;
const otherInstance = 9999;
/** OWNER and the other instance are alive; anything else, including 999999, is not. */
const alive = (pid: number) => pid === OWNER || pid === otherInstance;

describe('isStaleStreamRow', () => {
  test('a row whose owner is alive is live, whoever is asking', () => {
    expect(isStaleStreamRow({ session_id: 's1', owner_pid: OWNER }, alive)).toBe(false);
  });

  test('a row whose owner is gone is stale', () => {
    expect(isStaleStreamRow({ session_id: 's1', owner_pid: 999999 }, alive)).toBe(true);
  });

  test('the verdict does not depend on which instance is asking', () => {
    // The regression this shape exists for: several instances read ONE row and
    // must report the same status. Judging by the reader's own runtime registry
    // made a second instance call another instance's live run stale — the row
    // is live here, and every asker must say so.
    const row = { session_id: 's1', owner_pid: otherInstance };
    const verdicts = [otherInstance, OWNER, 12345].map(() => isStaleStreamRow(row, alive));
    expect(verdicts).toEqual([false, false, false]);
  });

  test('an ownerless row is stale, because nothing can vouch for its run', () => {
    expect(isStaleStreamRow({ session_id: 's1', owner_pid: null }, alive)).toBe(true);
  });

  test('a row owned by the reader is judged by liveness like any other', () => {
    // Self-ownership is not special-cased: the reader's own pid is alive while
    // it runs, so its live rows survive.
    expect(isStaleStreamRow({ session_id: 's1', owner_pid: OWNER }, (pid) => pid === OWNER)).toBe(false);
  });
});

/**
 * The other half of the heal, and the one the staleness rule structurally
 * cannot cover: a row this process owns while holding no live run for it.
 *
 * The shipped defect was exactly this shape — a dispatch wrote `stream`, omp
 * accepted the prompt and opened no turn, and no frame ever settled it. The
 * owner is ALIVE, so `isStaleStreamRow` says "live" and the row is
 * unreleasable; the sidebar spinner turns until the process restarts.
 */
describe('isOrphanStreamRow', () => {
  const ME = 4242;
  const running = new Set(['live-session']);

  test('releases a row this process owns with no live run behind it', () => {
    expect(isOrphanStreamRow({ session_id: 'orphan', owner_pid: ME }, ME, running)).toBe(true);
  });

  test('keeps the row of a session this process is actually running', () => {
    expect(isOrphanStreamRow({ session_id: 'live-session', owner_pid: ME }, ME, running)).toBe(false);
  });

  test('never touches another process’s row', () => {
    // That instance answers for its own runs; judging its rows from here is
    // exactly the cross-instance disagreement the owner-pid rule exists to
    // prevent.
    expect(isOrphanStreamRow({ session_id: 'theirs', owner_pid: 9999 }, ME, running)).toBe(false);
  });

  test('an omitted live-run set releases nothing', () => {
    // A caller that cannot answer "what am I running?" must never guess.
    expect(isOrphanStreamRow({ session_id: 'orphan', owner_pid: ME }, ME, undefined)).toBe(false);
  });

  test('an EMPTY live-run set releases every row this process owns', () => {
    // The honest reading of "I run nothing": this is what lets a restarted
    // process clear the rows its predecessor left behind.
    expect(isOrphanStreamRow({ session_id: 'orphan', owner_pid: ME }, ME, new Set())).toBe(true);
  });

  test('a row with no owner is the staleness rule’s business, not this one', () => {
    expect(isOrphanStreamRow({ session_id: 's1', owner_pid: null }, ME, running)).toBe(false);
    // ...and that rule does release it.
    expect(isStaleStreamRow({ session_id: 's1', owner_pid: null }, () => true)).toBe(true);
  });
});

/**
 * The run model rides the same row as the status, and the whole point of the
 * column pair is that a status flip cannot blank it: `agent_start`, the terminal
 * badge and the heal pass all re-mark the row with no model, and the COALESCE in
 * the upsert is what keeps the pair the indicator reads.
 */
describe('run model on the stream row', () => {
  let root: string;
  let savedDbPath: string | undefined;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'ompchamber-ss-'));
    savedDbPath = Bun.env.OMPCHAMBER_DB_PATH;
    // The writes resolve the database; point them at a temp tree so the real
    // `~/.ompchamber` is never opened.
    Bun.env.OMPCHAMBER_DB_PATH = join(root, 'db.sqlite');
    delete globalThis.__ompChamberDb;
  });

  afterEach(() => {
    delete globalThis.__ompChamberDb;
    if (savedDbPath === undefined) delete Bun.env.OMPCHAMBER_DB_PATH;
    else Bun.env.OMPCHAMBER_DB_PATH = savedDbPath;
    rmSync(root, { recursive: true, force: true });
  });

  test('a dispatch write stores the pair, and a status-only re-mark keeps it', async () => {
    await markStreamStatus('s1', 'stream', { provider: 'anthropic', modelId: 'claude' });
    expect((await loadStreamStates()).s1).toEqual({
      status: 'stream',
      model: { provider: 'anthropic', modelId: 'claude' },
    });

    // agent_start / turn_start / message_start / the terminal badge all write
    // the status alone.
    await markStreamStatus('s1', 'finish');
    expect((await loadStreamStates()).s1).toEqual({
      status: 'finish',
      model: { provider: 'anthropic', modelId: 'claude' },
    });
  });

  test('a later run’s model replaces the previous one', async () => {
    await markStreamStatus('s1', 'stream', { provider: 'anthropic', modelId: 'claude' });
    await markStreamStatus('s1', 'stream', { provider: 'openai', modelId: 'gpt-5' });
    expect((await loadStreamStates()).s1?.model).toEqual({ provider: 'openai', modelId: 'gpt-5' });
  });

  test('a row written without a model reports none, and the status view is status-only', async () => {
    await markStreamStatus('s2', 'abort');
    expect((await loadStreamStates()).s2).toEqual({ status: 'abort' });
    expect(await loadStreamStatuses()).toEqual({ s2: 'abort' });
  });

  test('renames the model of a LIVE row, leaving its status and owner alone', async () => {
    // omp's payload-less `model_changed` — a fallback-chain retry swapped the
    // model mid-run, and the indicator must name what the answer came from.
    await markStreamStatus('s1', 'stream', { provider: 'anthropic', modelId: 'claude' });
    await markStreamModel('s1', { provider: 'openai', modelId: 'gpt-5' });
    expect((await loadStreamStates()).s1).toEqual({
      status: 'stream',
      model: { provider: 'openai', modelId: 'gpt-5' },
    });
  });

  test('never resurrects a row for a run that already ended', async () => {
    // A fallback landing on the run's LAST frame must not put the spinner back:
    // `markStreamStatus(..., 'stream', model)` would upsert one, which is why
    // the rename is a live-only UPDATE.
    await markStreamStatus('s2', 'finish', { provider: 'anthropic', modelId: 'claude' });
    await markStreamModel('s2', { provider: 'openai', modelId: 'gpt-5' });
    expect((await loadStreamStates()).s2).toEqual({
      status: 'finish',
      model: { provider: 'anthropic', modelId: 'claude' },
    });
  });

  test('does nothing for a session with no live row', async () => {
    await markStreamModel('s3', { provider: 'openai', modelId: 'gpt-5' });
    expect((await loadStreamStates()).s3).toBeUndefined();
  });
});
