/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/** The session route group's follow-up queue: validation, ordering,
 * append/edit/remove/reorder, and the canonical-queue contract. Split verbatim
 * from `routes.test.ts` so both files stay under the repo's 350-line ceiling;
 * it shares the temp DB and the one live omp session the head file seeds. */


import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import fs from 'fs';
import path from 'path';
import type { ActionFunctionArgs } from '@/server/lib/remix-compat';
import { clearSessionFileCaches } from '@/server/lib/omp/session/files';
import { invalidateOmpSidebarData } from '@/server/lib/omp/session/reader';
import {
  addQueueItem,
  editQueueItem,
  getQueue,
  nudgeQueueDelivery,
  removeQueueItem,
  reorderQueueItems,
} from '@/server/routes/sessions/queue';

const ROOT = `/tmp/omc-sessions-routes-${process.pid}`;
const AGENT = path.join(ROOT, 'agent');
const SESSION_ID = '11111111-2222-3333-4444-555555555555';

let priorDbPath: string | undefined;
let priorMock: string | undefined;
let priorAgentDir: string | undefined;
let priorSlot: typeof globalThis.__ompChamberDb;

beforeAll(async () => {
  fs.rmSync(ROOT, { recursive: true, force: true });
  const project = path.join(AGENT, 'sessions', 'proj');
  fs.mkdirSync(project, { recursive: true });
  // One real session file, with a plan-mode entry, so the id resolver and the
  // transcript reader are exercised against a file rather than a stub.
  fs.writeFileSync(
    path.join(project, `${SESSION_ID}.jsonl`),
    [
      // A session header needs its `timestamp`: `scanSessionInfo` derives
      // `created` from it and `toOmpSession` calls `toISOString()`, so a
      // header without one takes the whole sidebar down with
      // `RangeError: Invalid Date`.
      JSON.stringify({ type: 'session', id: SESSION_ID, cwd: '/tmp', timestamp: '2026-09-30T10:00:00.000Z' }),
      JSON.stringify({ type: 'custom', customType: 'chamber-plan-state', data: { enabled: true } }),
      '',
    ].join('\n'),
  );

  priorAgentDir = Bun.env.PI_CODING_AGENT_DIR;
  priorDbPath = Bun.env.OMPCHAMBER_DB_PATH;
  priorMock = Bun.env.MOCK;
  priorSlot = globalThis.__ompChamberDb;

  Bun.env.PI_CODING_AGENT_DIR = AGENT;
  Bun.env.OMPCHAMBER_DB_PATH = path.join(ROOT, 'db.sqlite');
  Bun.env.MOCK = 'false';
  // The db handle is process-wide; drop any handle a sibling suite opened so
  // this file resolves the temp path, and leave the temp file on disk so a
  // later suite that inherits the slot cannot fall back to the real database.
  globalThis.__ompChamberDb = undefined;
  clearSessionFileCaches();
  invalidateOmpSidebarData();
});

afterAll(() => {
  clearSessionFileCaches();
  invalidateOmpSidebarData();
  if (priorAgentDir === undefined) delete Bun.env.PI_CODING_AGENT_DIR;
  else Bun.env.PI_CODING_AGENT_DIR = priorAgentDir;
  if (priorDbPath === undefined) delete Bun.env.OMPCHAMBER_DB_PATH;
  else Bun.env.OMPCHAMBER_DB_PATH = priorDbPath;
  if (priorMock === undefined) delete Bun.env.MOCK;
  else Bun.env.MOCK = priorMock;
  globalThis.__ompChamberDb = priorSlot;
  fs.rmSync(ROOT, { recursive: true, force: true });
});

function arrayOf(body: unknown, key: string): unknown[] {
  if (!body || typeof body !== 'object' || !(key in body)) throw new Error(`response has no ${key}`);
  const value: unknown = body[key as keyof typeof body];
  if (!Array.isArray(value)) throw new Error(`${key} is not an array`);
  return value;
}

function textOf(row: unknown, key: string): string {
  if (!row || typeof row !== 'object' || !(key in row)) throw new Error(`row has no ${key}`);
  const value: unknown = row[key as keyof typeof row];
  if (typeof value !== 'string') throw new Error(`row.${key} is not a string`);
  return value;
}
function jsonRequest(method: string, body: unknown, url = 'http://localhost/api/x'): Request {
  return new Request(url, {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('queue routes', () => {
  const SID = 'queue-session';
  const call = {
    get: () => getQueue({ params: { sessionId: SID } } as unknown as ActionFunctionArgs),
    add: (method: string, body: unknown) =>
      addQueueItem({ request: jsonRequest(method, body, `http://localhost/api/sessions/${SID}/queue`) as Request,
        params: { sessionId: SID },
      } as unknown as ActionFunctionArgs),
    edit: (method: string, body: unknown, itemId: string) =>
      editQueueItem({ request: jsonRequest(method, body, `http://localhost/api/sessions/${SID}/queue/${itemId}`) as Request,
        params: { sessionId: SID, itemId },
      } as unknown as ActionFunctionArgs),
    remove: (method: string, itemId: string) =>
      removeQueueItem({ request: new Request(`http://localhost/api/sessions/${SID}/queue/${itemId}`, { method }),
        params: { sessionId: SID, itemId },
      } as unknown as ActionFunctionArgs),
    reorder: (method: string, body: unknown) =>
      reorderQueueItems({ request: jsonRequest(method, body, `http://localhost/api/sessions/${SID}/queue`) as Request,
        params: { sessionId: SID },
      } as unknown as ActionFunctionArgs),
    nudge: (method: string) =>
      nudgeQueueDelivery({ request: new Request(`http://localhost/api/sessions/${SID}/queue/deliver`, { method }),
        params: { sessionId: SID },
      } as unknown as ActionFunctionArgs),
  };
  const texts = async (res: Response) =>
    arrayOf(await res.json(), 'queue').map((row) => textOf(row, 'text'));
  const ids = async (res: Response) =>
    arrayOf(await res.json(), 'queue').map((row) => textOf(row, 'id'));

  test('a missing session id is a 400 on every verb', async () => {
    expect((await getQueue({ params: {} } as unknown as ActionFunctionArgs)).status).toBe(400);
    for (const handler of [addQueueItem, editQueueItem, removeQueueItem, reorderQueueItems, nudgeQueueDelivery]) {
      const res = await handler({ request: jsonRequest('POST', {}) as Request,
        params: {},
      } as unknown as ActionFunctionArgs);
      expect(res.status).toBe(400);
    }
  });

  test('the wrong verb on each handler is a 405', async () => {
    expect((await call.add('GET', { text: 'x' })).status).toBe(405);
    expect((await call.edit('POST', { text: 'x' }, 'id')).status).toBe(405);
    expect((await call.remove('PATCH', 'id')).status).toBe(405);
    expect((await call.reorder('POST', { orderedIds: [] })).status).toBe(405);
    expect((await call.nudge('PUT')).status).toBe(405);
  });

  test('add refuses a body with neither text nor attachments', async () => {
    expect((await call.add('POST', {})).status).toBe(400);
    expect((await call.add('POST', { text: '   ' })).status).toBe(400);
  });

  test('add accepts blank text when attachments are present', async () => {
    const res = await call.add('POST', { text: '   ', attachments: [] });
    expect(res.status).toBe(200);
    expect(await texts(res)).toEqual(['   ']);
    // This case is a side trip through the guards: drop what it added so the
    // chain below starts from the empty queue its expectations document.
    const [addedId] = await ids(await call.get());
    expect((await call.remove('DELETE', addedId)).status).toBe(200);
  });

  test('add returns the canonical queue, and the append order is preserved', async () => {
    expect(await texts(await call.add('POST', { text: 'one' }))).toEqual(['one']);
    expect(await texts(await call.add('POST', { text: 'two' }))).toEqual(['one', 'two']);
    expect(await texts(await call.get())).toEqual(['one', 'two']);
  });

  test('edit updates an item and 404s for an id that is not there', async () => {
    const [itemId] = await ids(await call.get());
    expect(await texts(await call.edit('PATCH', { text: 'edited' }, itemId))).toEqual(['edited', 'two']);
    expect((await call.edit('PATCH', { text: 'x' }, 'missing-item')).status).toBe(404);
  });

  test('edit with no known field still answers the canonical queue', async () => {
    const [itemId] = await ids(await call.get());
    const res = await call.edit('PATCH', {}, itemId);
    expect(res.status).toBe(200);
    expect(await texts(res)).toEqual(['edited', 'two']);
  });

  test('reorder refuses anything but a string-id array', async () => {
    for (const body of [{}, { orderedIds: 'x' }, { orderedIds: [1] }]) {
      expect((await call.reorder('PUT', body)).status).toBe(400);
    }
  });

  test('reorder applies the requested order', async () => {
    const current = await ids(await call.get());
    expect(await texts(await call.reorder('PUT', { orderedIds: [...current].reverse() }))).toEqual(['two', 'edited']);
  });

  test('remove 404s for an unknown id and succeeds for a real one', async () => {
    expect((await call.remove('DELETE', 'missing-item')).status).toBe(404);
    const [itemId] = await ids(await call.get());
    expect((await call.remove('DELETE', itemId)).status).toBe(200);
    expect(await texts(await call.get())).toEqual(['edited']);
  });

  test('nudging a session with no live process does not deliver and still answers the queue', async () => {
    const res = await call.nudge('POST');
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ success: true, delivered: false, reason: 'session-not-live' });
  });
});
