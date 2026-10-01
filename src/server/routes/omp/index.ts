import { bindingsFor, type HandlerBinding } from '@/server/lib/route-adapter';
import * as ompState from '@/server/routes/omp/state';
import * as ompSidebar from '@/server/routes/omp/sidebar';
import * as ompSessionStats from '@/server/routes/omp/session-stats';
import * as ompSessionTodos from '@/server/routes/omp/session-todos';
import * as ompSessionPlan from '@/server/routes/omp/session-plan';
import * as ompExtensions from '@/server/routes/omp/extensions';
import * as ompLogin from '@/server/routes/omp/login';
import * as ompPlugins from '@/server/routes/omp/plugins';
import * as ompPricing from '@/server/routes/omp/pricing';
import * as ompReloadEngine from '@/server/routes/omp/reload-engine';
import * as ompBlob from '@/server/routes/omp/blob';

export const ompBindings: HandlerBinding[] = [
  ...bindingsFor(ompState, '/api/omp/state'),
  ...bindingsFor(ompSidebar, '/api/omp/sidebar'),
  ...bindingsFor(ompSessionStats, '/api/omp/session-stats'),
  ...bindingsFor(ompSessionTodos, '/api/omp/session-todos'),
  ...bindingsFor(ompSessionPlan, '/api/omp/session-plan'),
  ...bindingsFor(ompExtensions, '/api/omp/extensions'),
  ...bindingsFor(ompLogin, '/api/omp/login'),
  ...bindingsFor(ompPlugins, '/api/omp/plugins'),
  ...bindingsFor(ompPricing, '/api/omp/pricing'),
  ...bindingsFor(ompReloadEngine, '/api/omp/reload-engine'),
  ...bindingsFor(ompBlob, '/api/omp/blob'),
];
