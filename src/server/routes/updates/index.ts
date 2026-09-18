import { bindingsFor, type HandlerBinding } from '@/server/lib/route-adapter';
import * as updatesApply from '@/server/routes/updates/apply';
import * as updatesCheck from '@/server/routes/updates/check';

export const updatesBindings: HandlerBinding[] = [
  ...bindingsFor(updatesApply, '/api/updates/apply'),
  ...bindingsFor(updatesCheck, '/api/updates/check'),
];
