import { useEffect, useRef, useState } from 'preact/hooks';
import type { CSSProperties, Ref, TargetedKeyboardEvent } from 'preact';

import {
  continuesTyping,
  createHistory,
  mergeTyping,
  pushEdit,
  pushRecord,
  stepHistory,
  type HistoryRecord,
} from '@/client/components/common/code-editor/history';
import type { CodeWindow, LineWindow } from '@/shared/lib/code/lazy-window';

/**
 * Preact hand-roll of the textarea-over-<pre> highlighting editor
 * (the pattern react-simple-code-editor popularized), trimmed to the
 * feature set this app actually uses.
 *
 * How it works: a transparent <textarea> sits on top of a syntax-highlighted
 * <pre>. Typing, selecting and copying hit the native textarea; the <pre>
 * below just mirrors the text with Shiki markup.
 *
 * For a long document only a window of lines is mirrored (`virtual`): the
 * textarea still holds every line, so editing, selection and copy are
 * untouched, while the `<pre>` carries just the visible ones and reserves the
 * rest as padding — the alignment that keeps the caret over its own row.
 */

export interface CodeEditorProps {
  value: string;
  onValueChange: (value: string) => void;
  /** Return the Shiki-highlighted HTML for `code`, limited to `range` when the surface is windowed. */
  highlight: (code: string, range: LineWindow | null) => string;
  padding?: number;
  /** Class applied to the inner <pre> holding the highlighted code. */
  preClassName?: string;
  /** Class applied to the transparent <textarea> on top. */
  textareaClassName?: string;
  /** Layout styles for the whole editor; typography must match both layers. */
  style?: CSSProperties;
  /** The `<pre>` layer that actually wraps the code — gutter alignment measures it. */
  preRef?: Ref<HTMLPreElement>;
  className?: string;
  placeholder?: string;
  readOnly?: boolean;
  autoFocus?: boolean;
  /** Renders only this window of lines, with the rest reserved as space. Omit to mirror the whole value. */
  virtual?: CodeWindow | null;
}

const BASE_TEXTAREA_CLASS = 'code-editor-native-textarea';

const RESET_CSS = `
.code-editor-native-textarea {
  -webkit-text-fill-color: transparent;
}
.code-editor-native-textarea::placeholder {
  -webkit-text-fill-color: var(--theme-ink);
  opacity: 0.45;
}
`;

/** Shared <style> injected once per page. */
function EditorResetStyle() {
  return <style dangerouslySetInnerHTML={{ __html: RESET_CSS }} />;
}

function getLines(text: string, position: number): string[] {
  return text.substring(0, position).split('\n');
}

export function CodeEditor({
  value,
  onValueChange,
  highlight,
  padding = 0,
  preClassName,
  textareaClassName,
  style,
  preRef,
  className,
  placeholder,
  readOnly,
  autoFocus,
  virtual,
}: CodeEditorProps) {
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const historyRef = useRef(createHistory());
  const [captureTab, setCaptureTab] = useState(true);

  // Re-record when the controlled value is replaced from the outside
  // (file switch, refresh) so undo does not jump between documents.
  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    pushRecord(historyRef.current, {
      value: input.value,
      selectionStart: input.selectionStart,
      selectionEnd: input.selectionEnd,
      timestamp: Date.now(),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const applyEdits = (record: Pick<HistoryRecord, 'value' | 'selectionStart' | 'selectionEnd'>) => {
    const input = inputRef.current;
    const last = historyRef.current.stack[historyRef.current.offset];
    if (last && input) {
      // The entry on top is about to be superseded: keep where its caret was,
      // so undo returns to the selection this edit replaced.
      historyRef.current.stack[historyRef.current.offset] = {
        ...last,
        selectionStart: input.selectionStart,
        selectionEnd: input.selectionEnd,
      };
    }
    pushEdit(historyRef.current, { ...record, timestamp: Date.now() });
    onValueChange(record.value);
    if (input) {
      input.value = record.value;
      input.selectionStart = record.selectionStart;
      input.selectionEnd = record.selectionEnd;
    }
  };

  const handleKeyDown = (e: TargetedKeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Escape') {
      e.currentTarget.blur();
      return;
    }
    const { value: text, selectionStart, selectionEnd } = e.currentTarget;
    const tabCharacter = '  ';
    const isMac = /(Mac|iPhone|iPod|iPad)/i.test(navigator.platform);
    const isWindows = /Win/i.test(navigator.platform);

    if (e.key === 'Tab' && captureTab) {
      e.preventDefault();
      if (e.shiftKey) {
        // Unindent selected lines
        const linesBeforeCaret = getLines(text, selectionStart);
        const startLine = linesBeforeCaret.length - 1;
        const endLine = getLines(text, selectionEnd).length - 1;
        const nextValue = text
          .split('\n')
          .map((line, i) => (i >= startLine && i <= endLine && line.startsWith(tabCharacter) ? line.substring(tabCharacter.length) : line))
          .join('\n');
        if (nextValue !== text) {
          const startLineText = linesBeforeCaret[startLine];
          applyEdits({
            value: nextValue,
            selectionStart: startLineText?.startsWith(tabCharacter) ? selectionStart - tabCharacter.length : selectionStart,
            selectionEnd: selectionEnd - (text.length - nextValue.length),
          });
        }
      } else if (selectionStart !== selectionEnd) {
        // Indent selected lines
        const linesBeforeCaret = getLines(text, selectionStart);
        const startLine = linesBeforeCaret.length - 1;
        const endLine = getLines(text, selectionEnd).length - 1;
        const startLineText = linesBeforeCaret[startLine];
        applyEdits({
          value: text
            .split('\n')
            .map((line, i) => (i >= startLine && i <= endLine ? tabCharacter + line : line))
            .join('\n'),
          selectionStart: startLineText && /\S/.test(startLineText) ? selectionStart + tabCharacter.length : selectionStart,
          selectionEnd: selectionEnd + tabCharacter.length * (endLine - startLine + 1),
        });
      } else {
        const updatedSelection = selectionStart + tabCharacter.length;
        applyEdits({
          value: text.substring(0, selectionStart) + tabCharacter + text.substring(selectionEnd),
          selectionStart: updatedSelection,
          selectionEnd: updatedSelection,
        });
      }
      return;
    }

    if (e.key === 'Backspace' && selectionStart === selectionEnd) {
      const textBeforeCaret = text.substring(0, selectionStart);
      if (textBeforeCaret.endsWith(tabCharacter)) {
        e.preventDefault();
        const updatedSelection = selectionStart - tabCharacter.length;
        applyEdits({
          value: text.substring(0, selectionStart - tabCharacter.length) + text.substring(selectionEnd),
          selectionStart: updatedSelection,
          selectionEnd: updatedSelection,
        });
      }
      return;
    }

    if (e.key === 'Enter' && selectionStart === selectionEnd) {
      // Preserve indentation on new lines
      const line = getLines(text, selectionStart).pop();
      const matches = line?.match(/^\s+/);
      if (matches?.[0]) {
        e.preventDefault();
        const indent = '\n' + matches[0];
        const updatedSelection = selectionStart + indent.length;
        applyEdits({
          value: text.substring(0, selectionStart) + indent + text.substring(selectionEnd),
          selectionStart: updatedSelection,
          selectionEnd: updatedSelection,
        });
      }
      return;
    }

    // Undo (⌘Z / Ctrl+Z) through the custom history: browser undo would
    // desync the textarea from the highlighted <pre>.
    const undoKey = isMac ? e.metaKey && e.key.toLowerCase() === 'z' : e.ctrlKey && e.key.toLowerCase() === 'z';
    if (undoKey && !e.shiftKey && !e.altKey) {
      e.preventDefault();
      const record = stepHistory(historyRef.current, 'undo');
      if (record && inputRef.current) {
        inputRef.current.value = record.value;
        inputRef.current.selectionStart = record.selectionStart;
        inputRef.current.selectionEnd = record.selectionEnd;
        onValueChange(record.value);
      }
      return;
    }

    const redoKey = isMac
      ? e.metaKey && e.shiftKey && e.key.toLowerCase() === 'z'
      : isWindows
        ? e.ctrlKey && e.key.toLowerCase() === 'y'
        : e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'z';
    if (redoKey && !e.altKey) {
      e.preventDefault();
      const record = stepHistory(historyRef.current, 'redo');
      if (record && inputRef.current) {
        inputRef.current.value = record.value;
        inputRef.current.selectionStart = record.selectionStart;
        inputRef.current.selectionEnd = record.selectionEnd;
        onValueChange(record.value);
      }
      return;
    }

    // Ctrl+M / Ctrl+Shift+M toggles Tab capture so keyboard users can leave.
    if (e.ctrlKey && e.key.toLowerCase() === 'm' && (isMac ? e.shiftKey : true)) {
      e.preventDefault();
      setCaptureTab((prev) => !prev);
    }
  };

  const handleChange = (e: Event) => {
    const input = e.target as HTMLTextAreaElement;
    const { value: next, selectionStart, selectionEnd } = input;
    const history = historyRef.current;
    const timestamp = Date.now();
    // Merge typing bursts into one word-level undo entry.
    if (continuesTyping(history.stack[history.offset], next, selectionStart, timestamp)) {
      mergeTyping(history, next, selectionStart, selectionEnd, timestamp);
      onValueChange(next);
      return;
    }
    pushRecord(history, { value: next, selectionStart, selectionEnd, timestamp });
    onValueChange(next);
  };

  const layerStyle: CSSProperties = {
    margin: 0,
    border: 0,
    background: 'none',
    boxSizing: 'inherit',
    display: 'inherit',
    fontFamily: 'inherit',
    fontSize: 'inherit',
    fontStyle: 'inherit',
    fontVariantLigatures: 'inherit',
    fontWeight: 'inherit',
    letterSpacing: 'inherit',
    lineHeight: 'inherit',
    tabSize: 'inherit',
    textIndent: 'inherit',
    textRendering: 'inherit',
    textTransform: 'inherit',
    whiteSpace: 'pre-wrap',
    wordBreak: 'keep-all',
    overflowWrap: 'break-word',
  };

  // The textarea owns the full document, so its padding is the plain inset and
  // its lines land exactly where the geometry says line 0 starts.
  const contentStyle: CSSProperties = {
    paddingTop: padding,
    paddingRight: padding,
    paddingBottom: padding,
    paddingLeft: padding,
  };

  // The `<pre>` carries only the window; the lines it is not given are reserved
  // as padding, so the aligned layers stay aligned.
  const windowStyle: CSSProperties = {
    ...contentStyle,
    paddingTop: padding + (virtual?.top ?? 0),
    paddingBottom: padding + (virtual?.bottom ?? 0),
  };

  const highlighted = highlight(value, virtual ?? null);

  return (
    <div className={className} style={{ position: 'relative', textAlign: 'left', boxSizing: 'border-box', padding: 0, overflow: 'hidden', ...style }}>
      <pre
        ref={preRef}
        className={preClassName}
        aria-hidden="true"
        style={{ ...layerStyle, ...windowStyle, position: 'relative', pointerEvents: 'none' }}
        dangerouslySetInnerHTML={{ __html: highlighted + (virtual && !virtual.breakAtEnd ? '' : '<br />') }}
      />
      <textarea
        ref={inputRef}
        className={`${BASE_TEXTAREA_CLASS}${textareaClassName ? ` ${textareaClassName}` : ''}`}
        style={{ ...layerStyle, ...contentStyle, position: 'absolute', top: 0, left: 0, height: '100%', width: '100%', resize: 'none', color: 'inherit', overflow: 'hidden', WebkitTextFillColor: 'transparent' }}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        readOnly={readOnly}
        autoFocus={autoFocus}
        autoCapitalize="off"
        autoComplete="off"
        autoCorrect="off"
        spellcheck={false}
        data-gramm={false}
      />
      <EditorResetStyle />
    </div>
  );
}

export default CodeEditor;
