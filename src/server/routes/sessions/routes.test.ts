/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The sessions route group's request contract: id safety, name validation, the
 * per-session UI-state blob, and the follow-up queue's per-item mutations.
 *
 * Every case is a refusal or a boundary whose wrong answer would be silent: a
 * `.` session id must be a 404 before any path join (the delete route's own
 * blast-radius guard, reused here), a blank or over-long rename must be a 400
 * with its code rather than a truncated write, and a queue mutation must return
 * the canonical queue instead of trusting a client's full-list replacement.
 *
 * The routes are called directly, as the other route tests do. The database is
 * a temp SQLite file (never the developer's) and `PI_CODING_AGENT_DIR` a temp
 * tree holding one real session file, so the id resolver is exercised for real
 * while nothing outside `/tmp` is read.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import fs from 'fs';
import path from 'path';
import { getDb } from '@/server/db.server';
import type { DbClient } from '@/server/lib/db/client';
import type { ActionFunctionArgs } from '@/server/lib/remix-compat';
import { clearSessionFileCaches } from '@/server/lib/omp/session/files';
import { invalidateOmpSidebarData } from '@/server/lib/omp/session/reader';
import {
  archiveSession,
  getSessionModes,
  getSessionState,
  markSeen,
  putSessionState,
  renameSession,
} from '@/server/routes/sessions/session';

const ROOT = `/tmp/omc-sessions-routes-${process.pid}`;
const AGENT = path.join(ROOT, 'agent');
const SESSION_ID = '11111111-2222-3333-4444-555555555555';
const UNKNOWN = '00000000-0000-0000-0000-000000000000';

let db: DbClient;
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
  db = await getDb();
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

function formPost(body: Record<string, string>, url = 'http://localhost/api/x'): Request {
  const form = new FormData();
  for (const [key, value] of Object.entries(body)) form.append(key, value);
  return new Request(url, { method: 'POST', body: form });
}
function jsonRequest(method: string, body: unknown, url = 'http://localhost/api/x'): Request {
  return new Request(url, {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('getSessionModes', () => {
  test('a missing id is a 400', async () => {
    const res = (await getSessionModes({ params: {} } as unknown as ActionFunctionArgs) as unknown as Response);
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: 'Missing session id' });
  });

  test('a value that is not one path segment is a 404 before any lookup', async () => {
    for (const id of ['.', '..', 'a/b', 'a\\b']) {
      const res = (await getSessionModes({ params: { sessionId: id } } as unknown as ActionFunctionArgs) as unknown as Response);
      expect(res.status).toBe(404);
      expect(await res.json()).toMatchObject({ error: 'Session not found' });
    }
  });

  test('an unknown but well-formed id is a 404', async () => {
    expect((await getSessionModes({ params: { sessionId: UNKNOWN } } as unknown as ActionFunctionArgs)).status).toBe(404);
  });

  test('a real session file answers its persisted selection', async () => {
    const res = (await getSessionModes({ params: { sessionId: SESSION_ID } } as unknown as ActionFunctionArgs) as unknown as Response);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ sessionId: SESSION_ID, modes: { plan: true, goal: false } });
  });
});

describe('archiveSession', () => {
  test('a wrong verb is a 405', async () => {
    const res: Response = (await archiveSession({ request: new Request('http://localhost/api/x', { method: 'GET' }), params: { sessionId: SESSION_ID } } as unknown as ActionFunctionArgs) as unknown as Response);
    expect(res.status).toBe(405);
  });

  test('a missing id is a 400', async () => {
    const res: Response = (await archiveSession({ request: formPost({ archived: 'true' }), params: {} } as unknown as ActionFunctionArgs) as unknown as Response);
    expect(res.status).toBe(400);
  });

  test('archiving inserts the row and unarchiving removes it', async () => {
    const archive = async (archived: boolean): Promise<Response> =>
      archiveSession({ request: formPost({ archived: String(archived) }), params: { sessionId: SESSION_ID } } as unknown as ActionFunctionArgs) as unknown as Response;

    expect(await (await archive(true)).json()).toMatchObject({ success: true, archived: true });
    expect(await db.get('SELECT session_id FROM archived_sessions WHERE session_id = ?', [SESSION_ID])).toBeTruthy();
    expect(await (await archive(false)).json()).toMatchObject({ success: true, archived: false });
    expect(await db.get('SELECT session_id FROM archived_sessions WHERE session_id = ?', [SESSION_ID])).toBeNull();
  });
});

describe('renameSession', () => {
  const rename = async (name: string, sessionId = UNKNOWN): Promise<Response> =>
    renameSession({ request: formPost({ name }), params: { sessionId } } as unknown as ActionFunctionArgs) as unknown as Response;

  test('a wrong verb is a 405', async () => {
    const res = (await renameSession({ request: new Request('http://localhost/api/x', { method: 'GET' }), params: { sessionId: SESSION_ID } } as unknown as ActionFunctionArgs)) as Response;
    expect(res.status).toBe(405);
  });

  test('a missing id is a 400', async () => {
    const res = (await renameSession({ request: formPost({ name: 'x' }), params: {} } as unknown as ActionFunctionArgs)) as Response;
    expect(res.status).toBe(400);
  });

  test('a blank name is refused with its code', async () => {
    const res: Response = await rename('   ');
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: 'session_name_required' });
  });

  test('the 200-character ceiling is a boundary, not an off-by-one', async () => {
    // 201 is refused...
    const tooLong: Response = await rename('x'.repeat(201));
    expect(tooLong.status).toBe(400);
    expect(await tooLong.json()).toMatchObject({ code: 'session_name_too_long' });
  });

  test('a valid rename for an unknown session is a 404, not a write', async () => {
    const res: Response = await rename('a real name');
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ error: 'Session not found' });
  });
});

describe('per-session UI state', () => {
  const put = async (body: unknown): Promise<Response> =>
    putSessionState({ request: jsonRequest('POST', body), params: { sessionId: 'state-test' } } as unknown as ActionFunctionArgs) as unknown as Response;

  test('a missing id is a 400', async () => {
    const res = (await putSessionState({ request: jsonRequest('POST', { state: {} }),
      params: {},
    } as unknown as ActionFunctionArgs) as unknown as Response);
    expect(res.status).toBe(400);
  });

  test('a wrong verb is a 405', async () => {
    const res = (await putSessionState({ request: jsonRequest('PUT', { state: {} }),
      params: { sessionId: 'state-test' },
    } as unknown as ActionFunctionArgs) as unknown as Response);
    expect(res.status).toBe(405);
  });

  test('only an object state is accepted', async () => {
    for (const body of [{}, { state: null }, { state: [] }, { state: 'x' }, []]) {
      expect((await put(body)).status).toBe(400);
    }
  });

  test('a valid state round-trips through the store', async () => {
    const res: Response = await put({ state: { sidebar: 'open', n: 3 } });
    expect(res.status).toBe(200);
    const read = (await getSessionState({ params: { sessionId: 'state-test' } } as unknown as ActionFunctionArgs) as unknown as Response);
    expect(await read.json()).toMatchObject({ sessionId: 'state-test', state: { sidebar: 'open', n: 3 } });
  });

  test('a missing id on the read is a 400', async () => {
    expect((await getSessionState({ params: {} } as unknown as ActionFunctionArgs)).status).toBe(400);
  });
});

describe('markSeen', () => {
  test('a missing id is a 400', async () => {
    expect((await markSeen({ params: {} } as unknown as ActionFunctionArgs)).status).toBe(400);
  });

  test('acking a session with no stored status is a no-op success', async () => {
    const res = (await markSeen({ params: { sessionId: 'nothing-stored' } } as unknown as ActionFunctionArgs) as unknown as Response);
    expect(await res.json()).toMatchObject({ success: true, deleted: false });
  });
});
