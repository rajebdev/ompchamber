import { bindingsFor, type HandlerBinding } from '@/server/lib/route-adapter';
import * as filesRoot from '@/server/routes/files/root';
import * as filesToggle from '@/server/routes/files/toggle';

export const filesBindings: HandlerBinding[] = [
  // Both routes share the first path segment, so Elysia requires one parameter
  // name there; `fileId` is the name the toggle handler reads.
  ...bindingsFor(filesRoot, '/api/files/:fileId'),
  ...bindingsFor(filesToggle, '/api/files/:fileId/toggle'),
];
