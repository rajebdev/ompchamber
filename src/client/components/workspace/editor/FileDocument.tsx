import type { RefObject } from 'preact';
import { MarkdownRenderer } from '@/client/components/common/MarkdownRenderer';
import { CodeSurface, type CodeSurfaceHandle } from '@/client/components/common/code-surface';
import { FindWidget } from '@/client/components/workspace/editor/FindWidget';
import { CommandPalette } from '@/client/components/workspace/editor/CommandPalette';
import { scrollbarFadeClass } from '@/client/hooks/ui/scrollbar-fade';
import type { UseFileEditorResult } from '@/client/hooks/editor/use-file-editor';
import type { EditorFindState } from '@/client/hooks/editor/use-editor-find';
import { EDITOR_LINE_HEIGHT } from '@/shared/lib/code/editor/typography';
import type { TextRange } from '@/shared/lib/code/editor/commands';
import type { EditorCommand } from '@/shared/lib/code/editor/keymap';

interface FileDocumentProps {
  activeFile: { id: number | string; name: string; path: string; root?: string; repo?: string };
  editor: UseFileEditorResult;
  find: EditorFindState;
  surfaceRef: RefObject<CodeSurfaceHandle>;
  paletteOpen: boolean;
  onClosePalette: () => void;
  onRunCommand: (command: EditorCommand) => void;
  onScroll: () => void;
  isScrolling: boolean;
  wordWrap: boolean;
  zoomLevel: number;
  editorFontFamily: string;
  occurrences: readonly TextRange[];
  onOccurrencesChange: (next: readonly TextRange[]) => void;
  /** Markdown preview is on for the active file — render it, not the source. */
  isPreview: boolean;
  /**
   * A search hit was jumped to in this file. The find bar is closed (a search
   * jump must not cover the lines it is showing), but its matches still have to
   * be painted — that is the "highlight the results in the opened file" half of
   * the feature.
   */
  revealActive: boolean;
}

/**
 * The file's own document area: find bar, command palette, and either the
 * rendered markdown or the code surface.
 *
 * Extracted from the editor panel for the file-size ceiling, and it earns the
 * boundary — everything here is the DOCUMENT, while the panel around it is the
 * tab strip, the toolbar and the branch that decides which of the three
 * surfaces (file, diff, plugin panel) is showing.
 */
export function FileDocument({
  activeFile,
  editor,
  find,
  surfaceRef,
  paletteOpen,
  onClosePalette,
  onRunCommand,
  onScroll,
  isScrolling,
  wordWrap,
  zoomLevel,
  editorFontFamily,
  occurrences,
  onOccurrencesChange,
  isPreview,
  revealActive,
}: FileDocumentProps) {
  const isMd = activeFile.name.endsWith('.md');

  return (
    <div className="relative flex-1 min-h-0 flex flex-col">
      {find.open ? <FindWidget find={find} /> : null}
      {paletteOpen ? <CommandPalette onRun={onRunCommand} onClose={onClosePalette} /> : null}
      <div onScroll={onScroll} className={`flex-1 overflow-auto bg-paper flex ${scrollbarFadeClass(isScrolling)}`}>
        {isMd && isPreview ? (
          // No `prose` wrapper: markdown is styled by `.prose-content` alone
          // (the same system the chat timeline uses). The typography plugin
          // fought it — `.prose img` added 2em vertical margins that ballooned
          // a badge row into its own line box, and `--tw-prose-*` colors
          // ignored the theme.
          <div className="p-6 max-w-4xl mx-auto font-sans flex-1" style={{ fontSize: `${zoomLevel}px` }}>
            <MarkdownRenderer
              content={editor.content}
              document
              scope={{ path: activeFile.path, root: activeFile.root, repo: activeFile.repo }}
            />
          </div>
        ) : (
          <CodeSurface
            ref={surfaceRef}
            value={editor.content}
            onValueChange={editor.onChange}
            language={editor.language}
            wordWrap={wordWrap}
            marks={find.open || revealActive ? find.matches : undefined}
            currentMark={find.currentIndex}
            occurrences={occurrences}
            onOccurrencesChange={onOccurrencesChange}
            onCommand={onRunCommand}
            rootClassName="flex"
            gutterClassName="flex flex-col text-right pl-4 pr-3 select-none text-ink/30 font-mono border-r border-ink/10 bg-canvas sticky left-0 z-10"
            gutterStyle={{
              fontSize: zoomLevel,
              paddingTop: 16,
              paddingBottom: 16,
              lineHeight: EDITOR_LINE_HEIGHT,
              fontFamily: editorFontFamily,
            }}
            gutterLineClassName="min-w-[1.5rem]"
            // `min-w-max` keeps a long line intact and lets the panel scroll
            // sideways; while wrapping it would instead widen the column past
            // the panel, so the toggle had no effect at all.
            editorWrapperClassName={`flex-1 code-surface ${wordWrap ? 'min-w-0' : 'min-w-max'}`}
            editorPadding={16}
            editorClassName="font-mono focus:outline-none"
            editorStyle={{
              fontFamily: editorFontFamily,
              fontSize: zoomLevel,
              lineHeight: EDITOR_LINE_HEIGHT,
              minHeight: '100%',
              // Breathing room under the last line. It has to live on the
              // surface, not on the scroll container: a scroll container's own
              // bottom padding is not part of its scrollable overflow, so
              // `pb-*` on the scroller left the last line flush with the
              // panel's edge (measured: padding-bottom 32px did not change
              // scrollHeight by a single pixel).
              paddingBottom: 16,
            }}
          />
        )}
      </div>
    </div>
  );
}
