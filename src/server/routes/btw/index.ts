import { actionBindings, bindingsFor, type HandlerBinding } from '@/server/lib/route-adapter';
import { action, loader } from '@/server/routes/btw/topics';
import * as btwEvents from '@/server/routes/btw/events';

export const btwBindings: HandlerBinding[] = [
  ...actionBindings(action, '/api/btw/:sessionId', loader),
  ...bindingsFor(btwEvents, '/api/btw/:sessionId/events'),
];
