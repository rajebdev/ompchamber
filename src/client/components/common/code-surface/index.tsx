import type { CSSProperties } from 'preact';
import { CodeEditor } from '@/client/components/common/code-editor';
import { highlightCode } from '@/shared/lib/code/syntax-highlight';
import { useSyntaxReady } from '@/client/hooks/ui/syntax-ready';

const WRAP_ON = '!whitespace-pre-wrap !break-words';
const WRAP_OFF = '!whitespace-pre !break-normal';

interface CodeSurfaceProps {
  value: string;
  onValueChange: (value: string) => void;
  /** Shiki language id, already resolved from the file name. */
  language: string;
  wordWrap: boolean;
  /** Outer flex row that holds the gutter and the editor column. */
  rootClassName?: string;
  gutterClassName?: string;
  gutterStyle?: CSSProperties;
  /** Class on each gutter line number. */
  gutterLineClassName?: string;
  /** Column wrapping the CodeEditor (padding/overflow live here). */
  editorWrapperClassName?: string;
  editorClassName?: string;
  editorPadding?: number;
  editorStyle?: CSSProperties;
}

/**
 * The line-number gutter + syntax-highlighted editing surface shared by the
 * desktop editor and the phone's full-screen editor. Callers own only the
 * layout classes (padding, font, zoom) that genuinely differ per layout; the
 * gutter, word-wrap behaviour and Shiki highlighting live here so the two
 * surfaces cannot drift.
 */
export function CodeSurface({
  value,
  onValueChange,
  language,
  wordWrap,
  rootClassName,
  gutterClassName,
  gutterStyle,
  gutterLineClassName,
  editorWrapperClassName,
  editorClassName,
  editorPadding = 0,
  editorStyle,
}: CodeSurfaceProps) {
  const wrapClass = wordWrap ? WRAP_ON : WRAP_OFF;
  useSyntaxReady();

  return (
    <div className={rootClassName}>
      <div className={gutterClassName} style={gutterStyle}>
        {value.split('\n').map((_, i) => (
          <div key={i + 1} className={gutterLineClassName}>
            {i + 1}
          </div>
        ))}
      </div>
      <div className={editorWrapperClassName}>
        <CodeEditor
          value={value}
          onValueChange={onValueChange}
          highlight={(code) => highlightCode(code, language)}
          padding={editorPadding}
          textareaClassName={`focus:outline-none ${wrapClass}`}
          preClassName={wrapClass}
          style={editorStyle}
          className={editorClassName}
        />
      </div>
    </div>
  );
}
