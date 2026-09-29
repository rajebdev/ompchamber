import { bindingsFor, type HandlerBinding } from '@/server/lib/route-adapter';
import * as authState from '@/server/routes/auth/state';
import * as authLogin from '@/server/routes/auth/login';
import * as authLogout from '@/server/routes/auth/logout';
import * as authPassword from '@/server/routes/auth/password';
import * as authRevoke from '@/server/routes/auth/revoke';

export const authBindings: HandlerBinding[] = [
  ...bindingsFor(authState, '/api/auth/state'),
  ...bindingsFor(authLogin, '/api/auth/login'),
  ...bindingsFor(authLogout, '/api/auth/logout'),
  ...bindingsFor(authPassword, '/api/auth/password'),
  ...bindingsFor(authRevoke, '/api/auth/revoke'),
];
