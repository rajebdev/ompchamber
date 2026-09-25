/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The Files panel's "New file" branch.
 *
 * Two rules are load-bearing and neither is visible from the happy path: the
 * name may not carry a path separator (the folder is named by `path`, and a
 * separator would turn a name into an arbitrary write under the root), and an
 * existing file is REFUSED rather than truncated. The second one is the one a
 * naive `Bun.write` gets wrong: `Bun.write` creates or truncates, so a name
 * that collides with a real file would silently blank it.
 */

import { afterEach, describe, expect, test } from 'bun:test';
import fs from 'fs';
import path from 'path';
import { action } from '@/server/routes/fs/action';

/** Probes live in the repo root — the one directory the root allow-list always accepts. */
const DIR = path.join(process.cwd(), 'tmp-create-probe');
const NESTED = path.join(DIR, 'sub');

afterEach(() => {
  fs.rmSync(DIR, { recursive: true, force: true });
});

async function create(folderPath: string, name: string) {
  const form = new FormData();
  form.append('actionType', 'create');
  form.append('root', process.cwd());
  form.append('path', folderPath);
  form.append('name', name);
  const res = await action({ request: new Request('http://localhost/api/fs/action', { method: 'POST', body: form }) } as never);
  return { status: res.status, body: (await res.json()) as { success?: boolean; path?: string; error?: string } };
}

describe('fs create', () => {
  test('creates an empty file in the named folder and reports its relative path', async () => {
    fs.mkdirSync(DIR, { recursive: true });
    const { status, body } = await create('tmp-create-probe', 'notes.md');

    expect(status).toBe(200);
    expect(body).toEqual({ success: true, path: 'tmp-create-probe/notes.md' });
    expect(fs.readFileSync(path.join(DIR, 'notes.md'), 'utf8')).toBe('');
  });

  test('creates inside a nested folder path, which is how a subfolder is targeted', async () => {
    fs.mkdirSync(NESTED, { recursive: true });
    const { status, body } = await create('tmp-create-probe/sub', 'index.ts');

    expect(status).toBe(200);
    expect(body.path).toBe('tmp-create-probe/sub/index.ts');
    expect(fs.existsSync(path.join(NESTED, 'index.ts'))).toBe(true);
  });

  test('refuses an existing name instead of truncating it', async () => {
    fs.mkdirSync(DIR, { recursive: true });
    fs.writeFileSync(path.join(DIR, 'keep.txt'), 'important');

    const { status, body } = await create('tmp-create-probe', 'keep.txt');

    expect(status).toBe(409);
    expect(body.error).toContain('already exists');
    expect(fs.readFileSync(path.join(DIR, 'keep.txt'), 'utf8')).toBe('important');
  });

  test('refuses a name carrying a path separator', async () => {
    fs.mkdirSync(DIR, { recursive: true });
    for (const name of ['../escape.txt', 'sub/escape.txt', 'sub\\escape.txt']) {
      const { status } = await create('tmp-create-probe', name);
      expect(status).toBe(400);
    }
    expect(fs.existsSync(path.join(process.cwd(), 'escape.txt'))).toBe(false);
  });

  test('refuses an empty or whitespace-only name', async () => {
    fs.mkdirSync(DIR, { recursive: true });
    expect((await create('tmp-create-probe', '   ')).status).toBe(400);
    expect((await create('tmp-create-probe', '.')).status).toBe(400);
    expect((await create('tmp-create-probe', '..')).status).toBe(400);
  });

  test('refuses a folder that resolves outside the root', async () => {
    const { status } = await create('../outside', 'x.txt');
    expect(status).toBe(403);
  });
});
