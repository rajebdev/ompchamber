import { bindingsFor, type HandlerBinding } from '@/server/lib/route-adapter';
import * as terminalRun from '@/server/routes/terminal/run';
import * as terminalStream from '@/server/routes/terminal/stream';

export const terminalBindings: HandlerBinding[] = [
  ...bindingsFor(terminalRun, '/api/terminal/run'),
  ...bindingsFor(terminalStream, '/api/terminal/stream'),
];
