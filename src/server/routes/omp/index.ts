import { bindingsFor, type HandlerBinding } from '@/server/lib/route-adapter';
import * as ompState from '@/server/routes/omp/state';
import * as ompExtensions from '@/server/routes/omp/extensions';
import * as ompLogin from '@/server/routes/omp/login';
import * as ompReloadEngine from '@/server/routes/omp/reload-engine';
import * as ompBlob from '@/server/routes/omp/blob';

/**
 * The `/api/omp/*` bindings that remain.
 *
 * The sidebar, session-todos, session-plan, session-stats, pricing and plugins
 * routes were removed with the realtime cutover: the panels read the `sidebar`,
 * `todos`, `plan` and `usage` topics, and the plugin pane goes through
 * `/api/settings/plugins`, so none of them had a caller left. What stays is
 * request/response by nature — a login SSE stream, an extension toggle, a
 * reload POST, an image blob read, and the shared utility snapshot.
 */
export const ompBindings: HandlerBinding[] = [
  ...bindingsFor(ompState, '/api/omp/state'),
  ...bindingsFor(ompExtensions, '/api/omp/extensions'),
  ...bindingsFor(ompLogin, '/api/omp/login'),
  ...bindingsFor(ompReloadEngine, '/api/omp/reload-engine'),
  ...bindingsFor(ompBlob, '/api/omp/blob'),
];
