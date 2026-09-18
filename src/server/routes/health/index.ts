import { bindingsFor, type HandlerBinding } from '@/server/lib/route-adapter';
import * as healthProbe from '@/server/routes/health/probe';

export const healthBindings: HandlerBinding[] = [
  ...bindingsFor(healthProbe, '/api/health'),
];
