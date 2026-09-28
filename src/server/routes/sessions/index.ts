import { actionBindings, bindingsFor, type HandlerBinding } from '@/server/lib/route-adapter';
import * as sessionsList from '@/server/routes/sessions/list';
import * as sessionsFolder from '@/server/routes/sessions/folder';
import * as sessionsQueue from '@/server/routes/sessions/queue';
import {
  archiveSession,
  getSessionState,
  markSeen,
  putSessionState,
  renameSession,
} from '@/server/routes/sessions/session';
import { listSubagents, readSubagentTranscript } from '@/server/routes/sessions/subagents';
import { deleteSession } from '@/server/routes/sessions/delete';

export const sessionsBindings: HandlerBinding[] = [
  ...bindingsFor(sessionsList, '/api/sessions/list'),
  ...bindingsFor(sessionsFolder, '/api/sessions/:sessionId'),
  // DELETE-only on the same path the folder loader answers GET on: mounting it
  // through `actionBindings` would register a 405 GET fallback that Elysia
  // applies after the loader, replacing the workspace listing with it.
  { method: 'DELETE', path: '/api/sessions/:sessionId', handler: deleteSession },
  ...actionBindings(archiveSession, '/api/sessions/:sessionId/archive'),
  // Per-item queue routes. `actionBindings` mounts ALL four mutating verbs on
  // one path, and Elysia lets a later registration override an earlier one —
  // mounting reorder on the same `/queue` path that way would clobber the
  // add/GET bindings with its 405 GET fallback. Only reorder gets an explicit
  // PUT-only binding; add carries the shared GET loader.
  ...actionBindings(sessionsQueue.addQueueItem, '/api/sessions/:sessionId/queue', sessionsQueue.getQueue),
  ...actionBindings(sessionsQueue.editQueueItem, '/api/sessions/:sessionId/queue/:itemId'),
  { method: 'PUT', path: '/api/sessions/:sessionId/queue', handler: sessionsQueue.reorderQueueItems },
  { method: 'DELETE', path: '/api/sessions/:sessionId/queue/:itemId', handler: sessionsQueue.removeQueueItem },
  ...actionBindings(sessionsQueue.nudgeQueueDelivery, '/api/sessions/:sessionId/queue/deliver'),
  ...actionBindings(renameSession, '/api/sessions/:sessionId/rename'),
  ...actionBindings(putSessionState, '/api/sessions/:sessionId/state', getSessionState),
  ...actionBindings(markSeen, '/api/sessions/:sessionId/stream-seen'),
  { method: 'GET', path: '/api/sessions/:sessionId/subagents', handler: listSubagents },
  { method: 'GET', path: '/api/sessions/:sessionId/subagents/:subagentId', handler: readSubagentTranscript },
];
