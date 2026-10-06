import { actionBindings, type HandlerBinding } from '@/server/lib/route-adapter';
import { action, loader } from '@/server/routes/btw/topics';

export const btwBindings: HandlerBinding[] = [
  ...actionBindings(action, '/api/btw/:sessionId', loader),
];
