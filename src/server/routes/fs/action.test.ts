/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The save branch's byte contract.
 *
 * `multipart/form-data` normalizes every bare LF in a field value to CRLF in
 * transit — the HTML serializer does it on the way out and Bun's parser agrees
 * on the way in — so `content` reaches this route CRLF-normalized no matter what
 * the editor buffer held. The file's own ending therefore arrives as its own
 * `eol` field, and the bytes written to disk are built from it. Without that
 * step every save rewrote the whole file's line endings: an LF file came back
 * CRLF, which `git diff` reports as every line changed.
 */

import { afterEach, describe, expect, test } from 'bun:test';
import fs from 'fs';
import path from 'path';
import { action } from '@/server/routes/fs/action';

/** Probe files live in the repo root — the one directory the root allow-list always accepts. */
const PROBE = path.join(process.cwd(), 'tmp-eol-probe.txt');

afterEach(() => {
  fs.rmSync(PROBE, { force: true });
});

async function save(content: string, eol?: string) {
  const form = new FormData();
  form.append('actionType', 'save');
  form.append('root', process.cwd());
  form.append('path', 'tmp-eol-probe.txt');
  form.append('content', content);
  if (eol) form.append('eol', eol);
  const res = await action({ request: new Request('http://localhost/api/fs/action', { method: 'POST', body: form }) } as never);
  expect(res.status).toBe(200);
  return new Uint8Array(await Bun.file(PROBE).arrayBuffer());
}

describe('fs save line endings', () => {
  test('an lf request writes lf, whatever multipart did in transit', async () => {
    const bytes = await save('a\nb\n', 'lf');
    expect([...bytes]).toEqual([0x61, 0x0a, 0x62, 0x0a]);
  });

  test('a crlf request writes crlf', async () => {
    const bytes = await save('a\nb\n', 'crlf');
    expect([...bytes]).toEqual([0x61, 0x0d, 0x0a, 0x62, 0x0d, 0x0a]);
  });

  test('a payload that already carries crlf is not doubled', async () => {
    const bytes = await save('a\r\nb\r\n', 'crlf');
    expect([...bytes]).toEqual([0x61, 0x0d, 0x0a, 0x62, 0x0d, 0x0a]);
  });

  // No `eol` means the route has no instruction, so the payload is written as
  // multipart delivered it — which is CRLF, since the transport normalizes.
  test('a payload without an eol field is written as delivered', async () => {
    const bytes = await save('a\nb\n');
    expect([...bytes]).toEqual([0x61, 0x0d, 0x0a, 0x62, 0x0d, 0x0a]);
  });
});
