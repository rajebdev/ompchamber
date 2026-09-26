import { useCallback, useState } from 'preact/hooks';

/** Which of a two-pane settings category's screens a phone is showing. */
export type SettingsPane = 'list' | 'detail';

export interface SettingsMasterDetailHandle {
  pane: SettingsPane;
  /** Called by the category's own row handler, never derived from selection. */
  openDetail: () => void;
  back: () => void;
}

/**
 * Pane state for the settings categories that are two panes on a desktop.
 *
 * A phone has no room for a 224px list beside a detail pane: measured on a
 * 412x915 Android viewport, the detail was left 186px wide, and the categories
 * whose container stacked gave it 48px of height. Below `md` the two panes are
 * therefore two screens, and this is which one is up.
 *
 * The pane is opened by an EXPLICIT row choice, never by a selection that
 * merely exists: `useCrudList` selects its first row on load and the provider
 * list falls back to `connectedProviders[0]`, so deriving the pane from
 * `selectedId` would drop the user into a detail pane they never asked for and
 * hide the list they came to browse. Desktop ignores this state entirely —
 * `md:` shows both panes.
 */
export function useSettingsMasterDetail(): SettingsMasterDetailHandle {
  const [pane, setPane] = useState<SettingsPane>('list');
  const openDetail = useCallback(() => setPane('detail'), []);
  const back = useCallback(() => setPane('list'), []);
  return { pane, openDetail, back };
}
