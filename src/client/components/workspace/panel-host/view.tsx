/**
 * A plugin-contributed panel, resolved from its key and rendered in its slot.
 *
 * The key is all the layout stores; everything else (the entry path, the
 * granted capabilities, the plugin's own directory) comes from the registry at
 * render time. That indirection is what lets a panel be uninstalled and
 * reinstalled without the stored layout naming a path that no longer exists.
 *
 * A key the registry does not know renders a notice rather than nothing: the
 * layout legitimately remembers a panel across an uninstall, and a blank panel
 * would read as a broken chamber instead of a missing plugin.
 */

import { usePanelEntry } from '@/client/hooks/workspace/panel-registry';
import { PanelHost } from '@/client/components/workspace/panel-host/index';
import { useTheme } from '@/client/hooks/ui/theme';
import { useSessionStateContext } from '@/client/hooks/workspace/session-state/context';

interface PluginPanelViewProps {
  panelKey: string;
  /** False while the panel is hidden: no frame is mounted, so no plugin runs. */
  active: boolean;
  workspacePath: string | null;
  className?: string;
}

export function PluginPanelView({ panelKey, active, workspacePath, className = '' }: PluginPanelViewProps) {
  const { panel, ready } = usePanelEntry(panelKey);
  const { theme } = useTheme();
  const { sessionId } = useSessionStateContext();

  if (!panel) {
    return (
      <div className={`flex items-center justify-center px-6 text-center ${className || 'h-full w-full'}`}>
        <p className="text-xs text-ink/50 font-mono max-w-xs">
          {ready ? `Panel plugin not installed: ${panelKey}` : 'Loading panel…'}
        </p>
      </div>
    );
  }

  return (
    <PanelHost
      panel={panel}
      active={active}
      sessionId={sessionId ?? null}
      workspacePath={workspacePath}
      theme={theme}
      className={className}
    />
  );
}
