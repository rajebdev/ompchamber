import { actionBindings, bindingsFor, type HandlerBinding } from '@/server/lib/route-adapter';
import { getAgentState, sendCommand } from '@/server/routes/agent/command';
import * as agentNew from '@/server/routes/agent/new';
import * as agentPrewarm from '@/server/routes/agent/prewarm';

export const agentBindings: HandlerBinding[] = [
  ...actionBindings(sendCommand, '/api/agent/:sessionId', getAgentState),
  ...bindingsFor(agentNew, '/api/agent/new'),
  ...bindingsFor(agentPrewarm, '/api/agent/prewarm'),
];
