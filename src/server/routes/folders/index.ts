import { actionBindings, bindingsFor, type HandlerBinding } from '@/server/lib/route-adapter';
import * as foldersCreate from '@/server/routes/folders/create';
import {
  deleteFolder,
  pinFolder,
  toggleFolder,
  updateFolderSettings,
} from '@/server/routes/folders/folder';

export const foldersBindings: HandlerBinding[] = [
  ...bindingsFor(foldersCreate, '/api/folders'),
  ...actionBindings(pinFolder, '/api/folders/:folderId/pin'),
  ...actionBindings(toggleFolder, '/api/folders/:folderId/toggle'),
  ...actionBindings(deleteFolder, '/api/folders/:folderId/delete'),
  ...actionBindings(updateFolderSettings, '/api/folders/:folderId/settings'),
];
