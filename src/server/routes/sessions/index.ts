import { actionBindings, bindingsFor, type HandlerBinding } from '@/server/lib/route-adapter';
import * as sessionsList from '@/server/routes/sessions/list';
import * as sessionsFolder from '@/server/routes/sessions/folder';
import {
  archiveSession,
  getQueue,
  getSessionState,
  markSeen,
  putQueue,
  putSessionState,
  renameSession,
} from '@/server/routes/sessions/session';
import { listSubagents, readSubagentTranscript } from '@/server/routes/sessions/subagents';

export const sessionsBindings: HandlerBinding[] = [
  ...bindingsFor(sessionsList, '/api/sessions/list'),
  ...bindingsFor(sessionsFolder, '/api/sessions/:sessionId'),
  ...actionBindings(archiveSession, '/api/sessions/:sessionId/archive'),
  ...actionBindings(putQueue, '/api/sessions/:sessionId/queue', getQueue),
  ...actionBindings(renameSession, '/api/sessions/:sessionId/rename'),
  ...actionBindings(putSessionState, '/api/sessions/:sessionId/state', getSessionState),
  ...actionBindings(markSeen, '/api/sessions/:sessionId/stream-seen'),
  { method: 'GET', path: '/api/sessions/:sessionId/subagents', handler: listSubagents },
  { method: 'GET', path: '/api/sessions/:sessionId/subagents/:subagentId', handler: readSubagentTranscript },
];
