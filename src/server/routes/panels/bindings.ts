/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { bindingsFor, type HandlerBinding } from '@/server/lib/route-adapter';
import * as panelsRegistry from '@/server/routes/panels/registry';
import * as panelsAsset from '@/server/routes/panels/asset';
import * as panelsInstall from '@/server/routes/panels/install';
import * as panelsBuild from '@/server/routes/panels/build';

export const panelsBindings: HandlerBinding[] = [
  ...bindingsFor(panelsRegistry, '/api/panels'),
  ...bindingsFor(panelsAsset, '/api/panels/file/:slug/*'),
  ...bindingsFor(panelsInstall, '/api/panels/install'),
  ...bindingsFor(panelsBuild, '/api/panels/build'),
];
