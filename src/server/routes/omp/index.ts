import { bindingsFor, type HandlerBinding } from '@/server/lib/route-adapter';
import * as ompState from '@/server/routes/omp/state';
import * as ompSidebar from '@/server/routes/omp/sidebar';
import * as ompSessionStats from '@/server/routes/omp/session-stats';
import * as ompCommands from '@/server/routes/omp/commands';
import * as ompExtensions from '@/server/routes/omp/extensions';
import * as ompLogin from '@/server/routes/omp/login';
import * as ompPlugins from '@/server/routes/omp/plugins';
import * as ompPricing from '@/server/routes/omp/pricing';

export const ompBindings: HandlerBinding[] = [
  ...bindingsFor(ompState, '/api/omp/state'),
  ...bindingsFor(ompSidebar, '/api/omp/sidebar'),
  ...bindingsFor(ompSessionStats, '/api/omp/session-stats'),
  ...bindingsFor(ompCommands, '/api/omp/commands'),
  ...bindingsFor(ompExtensions, '/api/omp/extensions'),
  ...bindingsFor(ompLogin, '/api/omp/login'),
  ...bindingsFor(ompPlugins, '/api/omp/plugins'),
  ...bindingsFor(ompPricing, '/api/omp/pricing'),
];
