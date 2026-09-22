import { bindingsFor, type HandlerBinding } from '@/server/lib/route-adapter';
import * as terminalRun from '@/server/routes/terminal/run';
import * as terminalSessions from '@/server/routes/terminal/sessions';

export const terminalBindings: HandlerBinding[] = [
  ...bindingsFor(terminalRun, '/api/terminal/run'),
  ...bindingsFor(terminalSessions, '/api/terminal/sessions'),
];
