import { bindingsFor, type HandlerBinding } from '@/server/lib/route-adapter';
import * as chatRoot from '@/server/routes/chat/root';
import * as chatSession from '@/server/routes/chat/session';
import * as chatRewind from '@/server/routes/chat/rewind';
import * as chatStream from '@/server/routes/chat/stream';
import * as chatTurns from '@/server/routes/chat/turns';

export const chatBindings: HandlerBinding[] = [
  ...bindingsFor(chatRoot, '/api/chat'),
  ...bindingsFor(chatSession, '/api/chat/:sessionId'),
  ...bindingsFor(chatRewind, '/api/chat/:sessionId/rewind'),
  ...bindingsFor(chatStream, '/api/chat/stream'),
  ...bindingsFor(chatTurns, '/api/chat/:sessionId/turns'),
];
