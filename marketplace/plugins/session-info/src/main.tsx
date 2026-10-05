import { render } from 'preact';
import { PanelProvider, usePanelInfo, useSessionValue } from '@ompchamber/ui';
import { Field, FieldList, Panel, TextAreaField } from '@ompchamber/ui/components';
import '@ompchamber/ui/styles.css';

/** The active session's identity, from the host's handshake and later updates. */
function SessionFacts() {
  const info = usePanelInfo();
  return (
    <FieldList>
      <Field label="session" value={info.sessionId ?? 'none'} />
      <Field label="workspace" value={info.workspacePath ?? 'none'} />
      <Field label="panel" value={info.panelKey} />
      <Field label="capabilities" value={info.capabilities.join(', ') || 'none'} />
    </FieldList>
  );
}

/** A note kept in the session's own state, so it survives the frame. */
function Note() {
  const { value, status, error, update } = useSessionValue('note');
  const hint = error
    ? `Could not save: ${error}`
    : status === 'saved'
      ? 'Saved.'
      : status === 'saving'
        ? 'Saving…'
        : value
          ? 'Loaded from this session.'
          : 'Nothing saved yet.';

  return (
    <TextAreaField
      id="note"
      label="note (saved per session)"
      placeholder="Type a note for this session…"
      value={value}
      hint={hint}
      onInput={update}
    />
  );
}

function App() {
  return (
    <Panel title="Session Info">
      <SessionFacts />
      <Note />
    </Panel>
  );
}

render(
  <PanelProvider>
    <App />
  </PanelProvider>,
  document.body,
);
