import { bindingsFor, type HandlerBinding } from '@/server/lib/route-adapter';
import * as wellKnownDevtools from '@/server/routes/well-known/devtools';

export const wellKnownBindings: HandlerBinding[] = [
  ...bindingsFor(wellKnownDevtools, '/.well-known/appspecific/com.chrome.devtools.json'),
];
