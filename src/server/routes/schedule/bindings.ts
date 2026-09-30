import { bindingsFor, type HandlerBinding } from '@/server/lib/route-adapter';
import * as scheduleCollection from '@/server/routes/schedule/index';
import * as scheduleRuns from '@/server/routes/schedule/runs';

export const scheduleBindings: HandlerBinding[] = [
  ...bindingsFor(scheduleCollection, '/api/schedule'),
  ...bindingsFor(scheduleRuns, '/api/schedule/:taskId/runs'),
];
