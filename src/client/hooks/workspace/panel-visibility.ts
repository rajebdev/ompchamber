/**
 * Which right-panel buttons the user has hidden from the activity bar.
 *
 * Stored in the chamber settings blob rather than in session state, because it
 * describes the CHAMBER's furniture and not a working tree: a view hidden in
 * one session and back in the next would be a button that moves for no reason
 * the user can see. This is also the shape VS Code uses — activity-bar
 * visibility is workbench state.
 *
 * The list holds panel ids (a built-in view id or a `plugin:<id>/<panel>` key),
 * and an id that no longer resolves — an uninstalled plugin — is harmless: it
 * is compared against what the bar is about to render, never used as a lookup.
 *
 * Writes go through `writeChamberSettings` and are announced with an event, the
 * same pair the theme uses: two surfaces read this (the desktop bar and the
 * phone's tab bar) and a write that skipped the event would leave the other one
 * showing the previous set until a reload.
 */

import { useEffect, useState } from 'preact/hooks';
import { readChamberSetting } from '@/shared/lib/settings/client';
import { useChamberSettingsWriter } from '@/client/hooks/settings/use-chamber-setting';

/** Broadcast on every visibility write, so both layouts re-read. */
export const PANEL_VISIBILITY_EVENT = 'omp:panel-visibility-changed';

/** The chamber-blob key holding the hidden ids. */
const HIDDEN_PANELS_KEY = 'hiddenRightPanels';

function readHiddenPanels(): string[] {
  const stored = readChamberSetting<unknown>(HIDDEN_PANELS_KEY);
  return Array.isArray(stored) ? stored.filter((id): id is string => typeof id === 'string') : [];
}

export function useHiddenPanels(): [string[], (next: string[]) => void] {
  const write = useChamberSettingsWriter();
  const [hidden, setHidden] = useState<string[]>(readHiddenPanels);

  useEffect(() => {
    const onChange = () => setHidden(readHiddenPanels());
    window.addEventListener(PANEL_VISIBILITY_EVENT, onChange);
    return () => window.removeEventListener(PANEL_VISIBILITY_EVENT, onChange);
  }, []);

  const update = (next: string[]) => {
    setHidden(next);
    write({ [HIDDEN_PANELS_KEY]: next });
    window.dispatchEvent(new CustomEvent(PANEL_VISIBILITY_EVENT));
  };

  return [hidden, update];
}
