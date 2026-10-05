import { render } from 'preact';
import { PanelProvider, usePanelInfo, useSessionValue } from '@ompchamber/ui';
import { Panel, TextAreaField } from '@ompchamber/ui/components';
import '@ompchamber/ui/styles.css';

/** The status line, from the same save state the field reports. */
function scratchHint(status: string, error: string | null, sessionId: string | null): string {
  if (error) return `Could not save: ${error}`;
  if (status === 'saved') return 'Saved.';
  if (status === 'saving') return 'Saving…';
  return sessionId ? `Session ${sessionId.slice(0, 8)}…` : 'No session selected.';
}

/**
 * The same plugin's second panel, built from the same kit.
 *
 * It shares the manifest, the stylesheet and the components with the
 * right-panel view — which is the point of `entry` being per panel: one package
 * can ship several views without duplicating anything.
 */
function App() {
  const info = usePanelInfo();
  const { value, status, error, update } = useSessionValue('scratch');

  return (
    <Panel title="Scratchpad">
      <TextAreaField
        id="scratch"
        label="scratch (saved per session, separate from the panel's note)"
        placeholder="Rough notes for this session…"
        value={value}
        hint={scratchHint(status, error, info.sessionId)}
        onInput={update}
      />
    </Panel>
  );
}

render(
  <PanelProvider>
    <App />
  </PanelProvider>,
  document.body,
);
