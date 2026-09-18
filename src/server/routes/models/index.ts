import { bindingsFor, type HandlerBinding } from '@/server/lib/route-adapter';
import * as modelsRoot from '@/server/routes/models/root';
import * as modelsRoles from '@/server/routes/models/roles';

export const modelsBindings: HandlerBinding[] = [
  ...bindingsFor(modelsRoot, '/api/models'),
  ...bindingsFor(modelsRoles, '/api/model-roles'),
];
