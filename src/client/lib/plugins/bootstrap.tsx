import { useEffect } from 'preact/hooks';
import { usePanelRegistry } from '@/client/hooks/workspace/panel-registry';
import { setPluginContext } from '@/client/lib/plugins/context';
import { useSessionStateContext } from '@/client/hooks/workspace/session-state/context';

/**
 * Boot the plugin system, once, from the layout.
 *
 * Two things have to happen before a plugin component can render:
 *
 * 1. The registry read, which names the bundles to import. The import runs each
 *    plugin's `setup`, and that is what registers its components.
 * 2. The context the components read, published from here because it comes from
 *    the SESSION the layout owns — a plugin cannot resolve it, and a surface
 *    that forgot to publish it would show "no workspace" over a real one.
 *
 * Mounted at the top of the workspace, so both are in place before any panel
 * that would draw a plugin.
 */
export function PluginBootstrap({ workspacePath }: { workspacePath: string | null }) {
  const { sessionId } = useSessionStateContext();

  // The read is what triggers the imports; nothing else has to call it, and
  // calling it twice would be one request behind a shared cache.
  usePanelRegistry();

  useEffect(() => {
    setPluginContext(sessionId ?? null, workspacePath);
  }, [sessionId, workspacePath]);

  return null;
}
