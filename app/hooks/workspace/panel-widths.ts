import { useCallback, useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import {
  normalizePanelWidths,
  mergePanelWidths,
  type PanelWidths,
} from '@/lib/workspace/panel-widths';
import type { RightPanelType } from '@/lib/workspace/right-panels';

/** A drag commits once, after the pointer is released; this only coalesces. */
const PERSIST_DEBOUNCE_MS = 500;

interface PanelWidthsResult {
  widths: PanelWidths;
  /** Live widths, for imperative restores that cannot wait on a re-render. */
  widthsRef: RefObject<PanelWidths>;
  /** Fold measured panel widths in and persist the merged map. */
  commitWidths: (patch: PanelWidths) => void;
}

/**
 * Owns the desktop layout's per-panel width map: restored from
 * `app_settings.desktopLayoutSizes`, kept in a ref for resize handlers, and
 * written back (debounced) whenever a panel is resized. One writer for both
 * resizable groups, so neither clobbers the other's widths.
 */
export function usePanelWidths(
  appSettings: Record<string, any>,
  legacyView: RightPanelType,
): PanelWidthsResult {
  const [widths, setWidths] = useState<PanelWidths>(() =>
    normalizePanelWidths(appSettings.desktopLayoutSizes, legacyView),
  );
  const widthsRef = useRef<PanelWidths>(widths);
  // Set while a debounced write is pending, which is also the flush condition.
  const timerRef = useRef<number | undefined>(undefined);

  const saveNow = useCallback(() => {
    clearTimeout(timerRef.current);
    timerRef.current = undefined;
    fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ desktopLayoutSizes: widthsRef.current }),
    }).catch(console.error);
  }, []);

  const commitWidths = useCallback(
    (patch: PanelWidths) => {
      const next = mergePanelWidths(widthsRef.current, patch);
      widthsRef.current = next;
      setWidths(next);
      clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(saveNow, PERSIST_DEBOUNCE_MS);
    },
    [saveNow],
  );

  // The mobile layout unmounts this hook; flush instead of dropping the width
  // the user just dragged.
  useEffect(() => () => {
    if (timerRef.current !== undefined) saveNow();
  }, [saveNow]);

  return { widths, widthsRef, commitWidths };
}
