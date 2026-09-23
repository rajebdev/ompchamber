import { useCallback, useMemo } from 'preact/hooks';
import {
  mergePanelWidths,
  normalizePanelWidths,
  type PanelWidths,
} from '@/shared/lib/workspace/panel-widths';
import type { RightPanelType } from '@/shared/lib/workspace/right-panels';
import { useSessionState } from '@/client/hooks/workspace/session-state';

/** Session-state key holding this session's own per-panel widths. */
const PANEL_WIDTHS_KEY = 'layout.panelWidths';

interface PanelWidthsResult {
  widths: PanelWidths;
  /** Fold measured panel widths into this session's map. */
  commitWidths: (patch: PanelWidths) => void;
}

/**
 * Owns the desktop layout's per-panel width map.
 *
 * Widths are **per session**: they live in `session_ui_state` under
 * `layout.panelWidths`, next to the rest of a session's layout state
 * (`layout.activeRightPanel`, `layout.showRightPanel`, `layout.openedFiles`), so
 * switching sessions brings back the layout that session was left in.
 *
 * `app_settings.desktopLayoutSizes` is the **seed**: a session that has never
 * been resized reads it, which is what keeps an existing user's layout across
 * the upgrade instead of resetting everyone to the defaults. Once a panel is
 * dragged, the session stores its own map and the seed is no longer consulted
 * for that session.
 *
 * There is deliberately no px→fraction rewrite pass here. Converting a legacy
 * pixel value is done when a width is *read* (`resolvePanelWidth`), because a
 * write would have to run before this session's own blob has loaded and would
 * therefore overwrite it with the seed.
 */
export function usePanelWidths(
  appSettings: Record<string, any>,
  legacyView: RightPanelType,
): PanelWidthsResult {
  const seed = useMemo(
    () => normalizePanelWidths(appSettings.desktopLayoutSizes, legacyView),
    [appSettings.desktopLayoutSizes, legacyView],
  );
  const [widths, setWidths] = useSessionState<PanelWidths>(PANEL_WIDTHS_KEY, seed);

  const commitWidths = useCallback(
    (patch: PanelWidths) => {
      setWidths((prev) => mergePanelWidths(prev, patch));
    },
    [setWidths],
  );

  return { widths, commitWidths };
}
