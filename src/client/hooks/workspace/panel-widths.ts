import { useCallback } from 'preact/hooks';
import {
  mergePanelWidths,
  type PanelWidths,
} from '@/shared/lib/workspace/panel-widths';
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
 * A session that has never been resized starts EMPTY, so every panel opens at
 * its own default (`DEFAULT_EDITOR_FRACTIONS`, `DEFAULT_RIGHT_PANEL_FRACTION`,
 * `DEFAULT_LEFT_PANEL_WIDTH`). There is deliberately no global seed: a former
 * `app_settings.desktopLayoutSizes` carried the last global drag forward into
 * every new session, and since nothing has written it since the per-session
 * migration it was frozen at a stale value — measured, it pinned a new
 * session's editor to its 320px floor while the diff tab opened normally. The
 * mechanism could not be repaired by writing to it either: a write would have
 * to run before this session's own blob has loaded and would therefore clobber
 * it with the global value.
 */
export function usePanelWidths(): PanelWidthsResult {
  const [widths, setWidths] = useSessionState<PanelWidths>(PANEL_WIDTHS_KEY, {});

  const commitWidths = useCallback(
    (patch: PanelWidths) => {
      setWidths((prev) => mergePanelWidths(prev, patch));
    },
    [setWidths],
  );

  return { widths, commitWidths };
}
