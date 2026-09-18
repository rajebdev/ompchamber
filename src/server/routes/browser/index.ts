import { bindingsFor, type HandlerBinding } from '@/server/lib/route-adapter';
import * as browserStream from '@/server/routes/browser/stream';

export const browserBindings: HandlerBinding[] = [
  ...bindingsFor(browserStream, '/api/browser/:sessionId/stream'),
];
