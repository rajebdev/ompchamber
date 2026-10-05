/**
 * The capability bridge: the only path a panel frame has to chamber state.
 *
 * A panel runs in an iframe with an opaque origin, so it cannot call the
 * chamber's API — no cookies, no credentials, no same-origin fetch. Everything
 * it can read is a method listed here, and a method only answers when the
 * panel's manifest declared the capability that owns it. That is the whole
 * security model: the manifest is the grant, this table is the enforcement.
 *
 * Every method takes the panel's own registry entry and returns JSON-safe data.
 * Nothing returns a handle, a path outside the session's workspace, or a
 * function.
 */

import type { PanelCapability, PanelRegistryEntry } from '@/shared/types';
import { getSessionValue, setSessionKey } from '@/shared/lib/workspace/session-state/store';
import { currentThemeId } from '@/client/hooks/ui/theme';

export interface PanelCallContext {
  panel: PanelRegistryEntry;
  sessionId: string | null;
  workspacePath: string | null;
}

/** Which capability owns each method. A method absent here does not exist. */
const METHOD_CAPABILITY: Record<string, PanelCapability> = {
  'theme.get': 'theme',
  'sessionState.get': 'session-state',
  'sessionState.set': 'session-state',
  'workspace.list': 'workspace-read',
  'workspace.readText': 'workspace-read',
};

/** How much of a file a panel may read in one call. */
const MAX_READ_BYTES = 512 * 1024;

/**
 * `workspace.readText` goes through the chamber's own fs route rather than the
 * filesystem, so a panel inherits every root check that route already enforces
 * (`resolveRoot` accepts only the app root, a directory under it, or a
 * registered workspace project path). A panel that could name any absolute path
 * would be a file-read primitive for whatever the frame is running.
 */
async function readWorkspaceText(root: string | null, relPath: string): Promise<string> {
  if (!root) throw new Error('This session has no workspace folder');
  const url = new URL('/api/fs/read', location.origin);
  url.searchParams.set('root', root);
  url.searchParams.set('path', relPath);
  const response = await fetch(url, { credentials: 'same-origin' });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error || `Read failed (${response.status})`);
  }
  const body = (await response.json()) as { content?: string; truncated?: boolean };
  if (typeof body.content !== 'string') throw new Error('Read returned no content');
  if (body.content.length > MAX_READ_BYTES) throw new Error('File is too large to read in a panel');
  return body.content;
}

async function listWorkspace(root: string | null, relPath: string): Promise<unknown> {
  if (!root) throw new Error('This session has no workspace folder');
  const url = new URL('/api/fs/dir', location.origin);
  url.searchParams.set('root', root);
  url.searchParams.set('path', relPath || '.');
  const response = await fetch(url, { credentials: 'same-origin' });
  if (!response.ok) throw new Error(`List failed (${response.status})`);
  const body = (await response.json()) as { files?: unknown[] };
  return body.files ?? [];
}

/**
 * Answer one `call` from a panel frame.
 *
 * An unknown method and a declared-but-unimplemented one are deliberately
 * indistinguishable in the error text: a frame probing for methods it was not
 * granted learns nothing from the difference.
 */
export async function handlePanelCall(context: PanelCallContext, method: string, params: unknown): Promise<unknown> {
  const capability = METHOD_CAPABILITY[method];
  if (!capability) throw new Error(`Unknown method: ${method}`);
  if (!context.panel.capabilities.includes(capability)) {
    throw new Error(`Panel was not granted the "${capability}" capability`);
  }
  const args = (params ?? {}) as Record<string, unknown>;
  // One namespace for both directions: the store is one blob per session, so a
  // bare key would collide with the chamber's own layout keys — and a `get`
  // that read the bare key while `set` wrote the namespaced one silently
  // returned nothing for a value that had just been stored.
  const panelKey = `panel.${String(args.key ?? '')}`;

  switch (method) {
    case 'theme.get':
      return currentThemeId();
    case 'sessionState.get':
      return getSessionValue(context.sessionId, panelKey);
    case 'sessionState.set':
      // Values round-trip through postMessage, so only JSON-safe data arrives;
      // the store's own serialization is what persists it.
      setSessionKey(context.sessionId, panelKey, args.value);
      return true;
    case 'workspace.list':
      return listWorkspace(context.workspacePath, String(args.path ?? '.'));
    case 'workspace.readText':
      return readWorkspaceText(context.workspacePath, String(args.path ?? ''));
    default:
      throw new Error(`Unknown method: ${method}`);
  }
}
