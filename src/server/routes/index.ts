import { Elysia } from 'elysia';
import { mountBindings, type HandlerBinding } from '@/server/lib/route-adapter';
import { agentBindings } from '@/server/routes/agent';
import { agentWsRoutes } from '@/server/routes/agent/ws';
import { chatBindings } from '@/server/routes/chat';
import { sessionsBindings } from '@/server/routes/sessions';
import { settingsBindings } from '@/server/routes/settings';
import { fsBindings } from '@/server/routes/fs';
import { foldersBindings } from '@/server/routes/folders';
import { filesBindings } from '@/server/routes/files';
import { telemetryBindings } from '@/server/routes/telemetry';
import { terminalBindings } from '@/server/routes/terminal';
import { browserBindings } from '@/server/routes/browser';
import { modelsBindings } from '@/server/routes/models';
import { ompBindings } from '@/server/routes/omp';
import { updatesBindings } from '@/server/routes/updates';
import { healthBindings } from '@/server/routes/health';
import { wellKnownBindings } from '@/server/routes/well-known';

const allBindings: HandlerBinding[] = [
  ...agentBindings,
  ...chatBindings,
  ...sessionsBindings,
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
  ...healthBindings,
  ...wellKnownBindings,
];

export const apiRoutes = mountBindings(new Elysia(), allBindings).use(agentWsRoutes);
