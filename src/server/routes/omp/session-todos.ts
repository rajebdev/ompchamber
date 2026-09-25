/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * GET /api/omp/session-todos?sessionId=<uuid> — the session's live todo list.
 *
 * Read-only projection of oh-my-pi's own persisted `todo` state: the deepest
 * committed snapshot on the session transcript's active branch. omp is the
 * owner of this list and there is no second copy — see
 * `@/server/lib/omp/session/todos`.
 *
 * MOCK mode answers a deterministic demo list so the right-panel view renders
 * its full range of states (in progress, blocked, completed, abandoned) without
 * an omp install.
 */

import { json, NO_STORE_HEADERS } from '@/server/lib/remix-compat';
import type { LoaderFunctionArgs } from '@/server/lib/remix-compat';
import { isMockMode } from '@/server/mock.server';
import { readSessionTodos } from '@/server/lib/omp/session/todos';
import { todoProgress } from '@/shared/lib/chat/todo/snapshot';
import type { SessionTodosPayload, TodoPhase } from '@/shared/types/todo';

/** Demo list under MOCK=true: one phase of every status the panel must draw. */
const MOCK_PHASES: TodoPhase[] = [
  {
    name: 'Server data',
    tasks: [
      { content: 'Read the session transcript for the deepest todo snapshot', status: 'completed' },
      { content: 'Serve the list over /api/omp/session-todos', status: 'in_progress' },
      { content: 'Cache the parse by size + mtime', status: 'pending' },
      { content: 'Wire the panel poll to omp:session-updated', status: 'blocked', blocker: 'waiting on the event name' },
    ],
  },
  {
    name: 'Panel',
    tasks: [
      { content: 'Draw phase groups with per-status glyphs', status: 'pending' },
      { content: 'Collapse closed tasks behind a toggle', status: 'abandoned' },
    ],
  },
];

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const sessionId = url.searchParams.get('sessionId');

  if (isMockMode()) {
    return json(
      {
        sessionId: sessionId ?? 'mock',
        snapshot: {
          phases: MOCK_PHASES,
          sourceEntryId: 'mock-entry',
          source: 'toolResult',
          updatedAt: new Date().toISOString(),
          op: 'start',
          storage: 'session',
        },
        progress: todoProgress(MOCK_PHASES),
        generatedAt: new Date().toISOString(),
        isMock: true,
      } satisfies SessionTodosPayload,
      { headers: NO_STORE_HEADERS },
    );
  }

  if (!sessionId) return json({ error: 'sessionId is required' }, { status: 400 });

  const state = await readSessionTodos(sessionId);
  const payload: SessionTodosPayload = {
    sessionId,
    ...state,
    generatedAt: new Date().toISOString(),
    isMock: false,
  };
  return json(payload, { headers: NO_STORE_HEADERS });
}
