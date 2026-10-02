/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Ahead/behind counts and the remote-ref refresh cache.
 *
 * The counts come from the LOCAL tracking ref, so they are only as fresh as
 * the last fetch; the module's whole reason to exist is that nothing in the
 * chamber ever fetched, leaving the Sync badge stuck at ↑0 ↓0 while origin had
 * commits to pull. These tests build a real bare origin plus a clone in temp
 * dirs and pin: the zero answer when there is no upstream, a local commit
 * counting as ahead, a stale ref reporting zero until `refreshRemoteRefs`
 * moves it, the TTL suppressing a repeat fetch, `invalidateRemoteRefs`
 * forcing one, `markRemoteRefsFresh` suppressing the next one, and an
 * unreachable remote degrading to the tracking ref instead of throwing.
 */

import { afterAll, describe, expect, test } from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  gitSyncCount,
  invalidateRemoteRefs,
  markRemoteRefsFresh,
  refreshRemoteRefs,
} from '@/server/lib/fs/git-sync';

const tempDirs: string[] = [];

function tempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ompchamber-gitsync-'));
  tempDirs.push(dir);
  return dir;
}

function git(cwd: string, ...args: string[]): string {
  const result = Bun.spawnSync({ cmd: ['git', ...args], cwd });
  if (result.exitCode !== 0) {
    throw new Error(`git ${args.join(' ')} failed: ${result.stderr.toString()}`);
  }
  return result.stdout.toString();
}

function initRepo(cwd: string): void {
  git(cwd, 'init', '-q', '-b', 'main');
  git(cwd, 'config', 'user.email', 'test@example.invalid');
  git(cwd, 'config', 'user.name', 'Test');
}

function commitFile(cwd: string, name: string, message: string): void {
  fs.writeFileSync(path.join(cwd, name), `${name}\n`);
  git(cwd, 'add', '-A');
  git(cwd, 'commit', '-q', '-m', message);
}

/** A bare origin plus a clone tracking it, each on its own temp path. */
function makeClone(): { origin: string; clone: string } {
  const origin = tempDir();
  git(origin, 'init', '-q', '--bare', '-b', 'main');
  const clone = tempDir();
  git(tempDir(), 'clone', '-q', origin, clone);
  initRepo(clone);
  commitFile(clone, 'seed.txt', 'seed');
  git(clone, 'push', '-q', '-u', 'origin', 'main');
  return { origin, clone };
}

/** A second clone used only to move origin forward. */
function pushToOrigin(origin: string, name: string): void {
  const work = tempDir();
  git(tempDir(), 'clone', '-q', origin, work);
  initRepo(work);
  commitFile(work, name, `remote ${name}`);
  git(work, 'push', '-q');
}

afterAll(() => {
  for (const dir of tempDirs) fs.rmSync(dir, { recursive: true, force: true });
});

describe('gitSyncCount without an upstream', () => {
  test('a repository with no upstream answers zero on both sides', async () => {
    const repo = tempDir();
    initRepo(repo);
    commitFile(repo, 'a.txt', 'a');
    expect(await gitSyncCount(repo)).toEqual({ ahead: 0, behind: 0 });
  });

  test('a directory that is not a repository answers zero instead of throwing', async () => {
    expect(await gitSyncCount(tempDir())).toEqual({ ahead: 0, behind: 0 });
  });

  test('refreshRemoteRefs is a no-op without an upstream', async () => {
    const repo = tempDir();
    initRepo(repo);
    await refreshRemoteRefs(repo);
    expect(await gitSyncCount(repo)).toEqual({ ahead: 0, behind: 0 });
  });
});

describe('ahead/behind against a real remote', () => {
  test('a fresh clone is even with its origin', async () => {
    const { clone } = makeClone();
    expect(await gitSyncCount(clone)).toEqual({ ahead: 0, behind: 0 });
  });

  test('a local commit counts as ahead without any fetch', async () => {
    const { clone } = makeClone();
    commitFile(clone, 'local.txt', 'local work');
    expect(await gitSyncCount(clone)).toEqual({ ahead: 1, behind: 0 });
  });

  test('the stale tracking ref reports zero until a refresh moves it', async () => {
    const { origin, clone } = makeClone();
    pushToOrigin(origin, 'remote.txt');

    // The ref has not moved: this is the badge that used to stay at zero.
    expect(await gitSyncCount(clone)).toEqual({ ahead: 0, behind: 0 });

    await refreshRemoteRefs(clone);
    expect(await gitSyncCount(clone)).toEqual({ ahead: 0, behind: 1 });
  });

  test('a second refresh inside the TTL does not fetch again', async () => {
    const { origin, clone } = makeClone();
    await refreshRemoteRefs(clone);
    pushToOrigin(origin, 'remote.txt');

    await refreshRemoteRefs(clone);
    expect(await gitSyncCount(clone)).toEqual({ ahead: 0, behind: 0 });

    // The forced refresh proves the ref really had moved and the TTL, not a
    // failed fetch, is what kept the previous read at zero.
    invalidateRemoteRefs(clone);
    await refreshRemoteRefs(clone);
    expect(await gitSyncCount(clone)).toEqual({ ahead: 0, behind: 1 });
  });

  test('markRemoteRefsFresh suppresses the next fetch', async () => {
    const { origin, clone } = makeClone();
    invalidateRemoteRefs(clone);
    markRemoteRefsFresh(clone);
    pushToOrigin(origin, 'remote.txt');

    await refreshRemoteRefs(clone);
    expect(await gitSyncCount(clone)).toEqual({ ahead: 0, behind: 0 });

    invalidateRemoteRefs(clone);
    await refreshRemoteRefs(clone);
    expect(await gitSyncCount(clone)).toEqual({ ahead: 0, behind: 1 });
  });

  test('an unreachable remote degrades to the tracking ref', async () => {
    const { clone } = makeClone();
    git(clone, 'remote', 'set-url', 'origin', path.join(tempDir(), 'no-such-remote.git'));

    invalidateRemoteRefs(clone);
    await refreshRemoteRefs(clone);
    expect(await gitSyncCount(clone)).toEqual({ ahead: 0, behind: 0 });
  });

  test('an unreachable remote still reports the local ahead count', async () => {
    const { clone } = makeClone();
    git(clone, 'remote', 'set-url', 'origin', path.join(tempDir(), 'no-such-remote.git'));
    commitFile(clone, 'local.txt', 'local work');

    invalidateRemoteRefs(clone);
    await refreshRemoteRefs(clone);
    expect(await gitSyncCount(clone)).toEqual({ ahead: 1, behind: 0 });
  });
});
