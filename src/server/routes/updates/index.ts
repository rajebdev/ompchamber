import { bindingsFor, type HandlerBinding } from '@/server/lib/route-adapter';
import * as updatesApply from '@/server/routes/updates/apply';
import * as updatesChangelog from '@/server/routes/updates/changelog';
import * as updatesCheck from '@/server/routes/updates/check';

export const updatesBindings: HandlerBinding[] = [
  ...bindingsFor(updatesApply, '/api/updates/apply'),
  ...bindingsFor(updatesChangelog, '/api/updates/changelog'),
  ...bindingsFor(updatesCheck, '/api/updates/check'),
];
