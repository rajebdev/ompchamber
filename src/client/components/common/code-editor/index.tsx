import { useEffect, useRef, useState } from 'preact/hooks';
import type { CSSProperties, TargetedKeyboardEvent } from 'preact';

/**
 * Preact hand-roll of the textarea-over-<pre> highlighting editor
 * (the pattern react-simple-code-editor popularized), trimmed to the
 * feature set this app actually uses.
 *
 * How it works: a transparent <textarea> sits on top of a syntax-highlighted
 * <pre>. Typing, selecting and copying hit the native textarea; the <pre>
 * below just mirrors the text with Prism markup.
 */

const HISTORY_LIMIT = 100;
const HISTORY_TIME_GAP = 3000;

interface HistoryRecord {
  value: string;
  selectionStart: number;
  selectionEnd: number;
  timestamp: number;
}

interface History {
  stack: HistoryRecord[];
  offset: number;
}

export interface CodeEditorProps {
  value: string;
  onValueChange: (value: string) => void;
  /** Return the Prism-highlighted HTML for the given code. */
  highlight: (code: string) => string;
  padding?: number;
  /** Class applied to the inner <pre> holding the highlighted code. */
  preClassName?: string;
  /** Class applied to the transparent <textarea> on top. */
  textareaClassName?: string;
  /** Layout styles for the whole editor; typography must match both layers. */
  style?: CSSProperties;
  className?: string;
  placeholder?: string;
  readOnly?: boolean;
  autoFocus?: boolean;
}

const BASE_TEXTAREA_CLASS = 'code-editor-native-textarea';

const RESET_CSS = `
.${BASE_TEXTAREA_CLASS}:empty {
  -webkit-text-fill-color: inherit !important;
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
  className,
  placeholder,
  readOnly,
  autoFocus,
}: CodeEditorProps) {
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const historyRef = useRef<History>({ stack: [], offset: -1 });
  const [captureTab, setCaptureTab] = useState(true);

  // Re-record when the controlled value is replaced from the outside
  // (file switch, refresh) so undo does not jump between documents.
  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    const record: HistoryRecord = {
      value: input.value,
      selectionStart: input.selectionStart,
      selectionEnd: input.selectionEnd,
      timestamp: Date.now(),
    };
    const { stack, offset } = historyRef.current;
    if (stack.length && offset > -1) {
      historyRef.current.stack = stack.slice(0, offset + 1);
    }
    historyRef.current.stack.push(record);
    historyRef.current.offset = historyRef.current.stack.length - 1;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const applyEdits = (record: Pick<HistoryRecord, 'value' | 'selectionStart' | 'selectionEnd'>) => {
    const input = inputRef.current;
    const last = historyRef.current.stack[historyRef.current.offset];
    if (last && input) {
      historyRef.current.stack[historyRef.current.offset] = {
        ...last,
        selectionStart: input.selectionStart,
        selectionEnd: input.selectionEnd,
      };
    }
    historyRef.current.stack.push({ ...record, timestamp: Date.now() });
    historyRef.current.offset = historyRef.current.stack.length - 1;
    if (historyRef.current.stack.length > HISTORY_LIMIT) {
      const extras = historyRef.current.stack.length - HISTORY_LIMIT;
      historyRef.current.stack = historyRef.current.stack.slice(extras);
      historyRef.current.offset = Math.max(historyRef.current.offset - extras, 0);
    }
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
      const { stack, offset } = historyRef.current;
      const record = stack[offset - 1];
      if (record && inputRef.current) {
        inputRef.current.value = record.value;
        inputRef.current.selectionStart = record.selectionStart;
        inputRef.current.selectionEnd = record.selectionEnd;
        onValueChange(record.value);
        historyRef.current.offset = Math.max(offset - 1, 0);
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
      const { stack, offset } = historyRef.current;
      const record = stack[offset + 1];
      if (record && inputRef.current) {
        inputRef.current.value = record.value;
        inputRef.current.selectionStart = record.selectionStart;
        inputRef.current.selectionEnd = record.selectionEnd;
        onValueChange(record.value);
        historyRef.current.offset = Math.min(offset + 1, stack.length - 1);
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
    const { stack, offset } = historyRef.current;
    const timestamp = Date.now();
    if (stack.length && offset > -1) {
      historyRef.current.stack = stack.slice(0, offset + 1);
    }
    const last = historyRef.current.stack[historyRef.current.offset];
    // Merge typing bursts into one word-level undo entry.
    if (last && timestamp - last.timestamp < HISTORY_TIME_GAP) {
      const re = /[^a-z0-9]([a-z0-9]+)$/i;
      const previous = getLines(last.value, last.selectionStart).pop()?.match(re);
      const current = getLines(next, selectionStart).pop()?.match(re);
      if (previous?.[1] && current?.[1]?.startsWith(previous[1])) {
        historyRef.current.stack[historyRef.current.offset] = { value: next, selectionStart, selectionEnd, timestamp };
        onValueChange(next);
        return;
      }
    }
    historyRef.current.stack.push({ value: next, selectionStart, selectionEnd, timestamp });
    historyRef.current.offset = historyRef.current.stack.length - 1;
    onValueChange(next);
  };

  const contentStyle: CSSProperties = {
    paddingTop: padding,
    paddingRight: padding,
    paddingBottom: padding,
    paddingLeft: padding,
  };

  const highlighted = highlight(value);

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

  return (
    <div className={className} style={{ position: 'relative', textAlign: 'left', boxSizing: 'border-box', padding: 0, overflow: 'hidden', ...style }}>
      <pre
        className={preClassName}
        aria-hidden="true"
        style={{ ...layerStyle, ...contentStyle, position: 'relative', pointerEvents: 'none' }}
        dangerouslySetInnerHTML={{ __html: highlighted + '<br />' }}
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
