import { Elysia } from 'elysia';
import { mountBindings, type HandlerBinding } from '@/server/lib/route-adapter';
import { agentBindings } from '@/server/routes/agent';
import { agentWsRoutes } from '@/server/routes/agent/ws';
import { authBindings } from '@/server/routes/auth';
import { btwBindings } from '@/server/routes/btw';
import { btwWsRoutes } from '@/server/routes/btw/ws';
import { chatBindings } from '@/server/routes/chat';
import { sessionsBindings } from '@/server/routes/sessions';
import { scheduleBindings } from '@/server/routes/schedule/bindings';
import { settingsBindings } from '@/server/routes/settings';
import { fsBindings } from '@/server/routes/fs';
import { foldersBindings } from '@/server/routes/folders';
import { filesBindings } from '@/server/routes/files';
import { telemetryBindings } from '@/server/routes/telemetry';
import { terminalBindings } from '@/server/routes/terminal';
import { terminalWsRoutes } from '@/server/routes/terminal/ws';
import { dictationWsRoutes } from '@/server/routes/dictation/ws';
import { browserBindings } from '@/server/routes/browser';
import { modelsBindings } from '@/server/routes/models';
import { ompBindings } from '@/server/routes/omp';
import { updatesBindings } from '@/server/routes/updates';
import { wikiBindings } from '@/server/routes/wiki';
import { panelsBindings } from '@/server/routes/panels/bindings';
import { healthBindings } from '@/server/routes/health';
import { wellKnownBindings } from '@/server/routes/well-known';

const allBindings: HandlerBinding[] = [
  ...authBindings,
  ...agentBindings,
  ...btwBindings,
  ...chatBindings,
  ...sessionsBindings,
  ...scheduleBindings,
  ...settingsBindings,
  ...fsBindings,
  ...foldersBindings,
  ...filesBindings,
  ...telemetryBindings,
  ...terminalBindings,
  ...browserBindings,
  ...modelsBindings,
  ...ompBindings,
  ...updatesBindings,
  ...wikiBindings,
  ...panelsBindings,
  ...healthBindings,
  ...wellKnownBindings,
];

export const apiRoutes = mountBindings(new Elysia(), allBindings)
  .use(agentWsRoutes)
  .use(btwWsRoutes)
  .use(terminalWsRoutes)
  .use(dictationWsRoutes);
