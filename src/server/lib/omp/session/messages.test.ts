/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterAll, describe, expect, test } from 'bun:test';
import fs from 'fs';
import { join } from 'path';

import { loadSessionMessages } from '@/server/lib/omp/session/messages';

const tempDirs: string[] = [];

/** Write a session JSONL whose lines are exactly the given records, in order. */
async function writeSession(lines: unknown[]): Promise<string> {
  const dir = await fs.promises.mkdtemp('omp-messages-');
  tempDirs.push(dir);
  const file = join(dir, 'session.jsonl');
  await Bun.write(file, `${lines.map((line) => JSON.stringify(line)).join('\n')}\n`);
  return file;
}

afterAll(() => {
  for (const dir of tempDirs) fs.rmSync(dir, { recursive: true, force: true });
});

const at = (second: number) => `2026-09-21T03:00:${String(second).padStart(2, '0')}.000Z`;

/** omp records harness notices as their own `custom_message` entry. */
const notice = (id: string, text: string, second: number) => ({
  type: 'custom_message',
  id,
  customType: 'ultrathink-notice',
  timestamp: at(second),
  content: [{ type: 'text', text: `<system-notice>${text}</system-notice>` }],
});

const turn = (id: string, role: 'user' | 'assistant', text: string, second: number) => ({
  type: 'message',
  id,
  timestamp: at(second),
  message: { role, content: [{ type: 'text', text }] },
});

describe('loadSessionMessages ordering', () => {
  test('returns entries in file order, leaving a notice before its following user turn', async () => {
    const file = await writeSession([
      notice('n1', 'Background job finished.', 0),
      turn('u1', 'user', 'halo', 1),
      turn('a1', 'assistant', 'hai', 2),
    ]);

    const messages = await loadSessionMessages(file);

    expect(messages.map((m) => m.id)).toEqual(['n1', 'u1', 'a1']);
    expect(messages[0].notice).toBe('Background job finished.');
    expect(messages[1]).toMatchObject({ role: 'user', content: 'halo' });
    expect(messages[2]).toMatchObject({ role: 'ai', content: 'hai' });
  });

  test('preserves a notice that sits between two turns', async () => {
    const file = await writeSession([
      turn('u1', 'user', 'satu', 0),
      turn('a1', 'assistant', 'dua', 1),
      notice('n1', 'Job done.', 2),
      turn('u2', 'user', 'tiga', 3),
      turn('a2', 'assistant', 'empat', 4),
    ]);

    expect((await loadSessionMessages(file)).map((m) => m.id)).toEqual(['u1', 'a1', 'n1', 'u2', 'a2']);
  });
});
