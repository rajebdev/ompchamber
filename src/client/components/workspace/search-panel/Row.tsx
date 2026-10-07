/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * One search hit.
 *
 * Two things happen here that the panel's own state does not own:
 *
 * - **The matched text is highlighted**, using the character ranges the server
 *   derived from ripgrep's own submatches. Those ranges ride the same
 *   `find-match` markup the editor's find bar paints, so a hit looks the same
 *   wherever it is read and the highlight cannot drift from the text it belongs
 *   to. When the server sent no ranges (an older response), they are recomputed
 *   with the editor's own matcher rather than leaving the row unmarked.
 * - **With a replacement typed, the row previews the line**, the old text struck
 *   through and the new text beside it, the way VS Code's search view does. The
 *   split is `replacePreviewSegments`' job; this file only paints it.
 */

import { highlightCode } from '@/shared/lib/code/syntax-highlight';
import { getLanguageFromPath } from '@/shared/lib/code/language';
import { findMatches, type FindOptions } from '@/shared/lib/code/editor/find';
import { replacePreviewSegments } from '@/shared/lib/fs/search-row';
import type { SearchResultItem } from '@/shared/types/fs';

interface SearchRowProps {
  file: string;
  result: SearchResultItem;
  /** The query the row was found by, used when the response carried no ranges. */
  query: string;
  options: FindOptions;
  replacement: string;
  onOpen: (result: SearchResultItem) => void;
}

export function SearchRow({ file, result, query, options, replacement, onOpen }: SearchRowProps) {
  const ranges = result.ranges?.length ? result.ranges : findMatches(result.content, query, options).matches;
  const preview = replacement.length > 0;

  return (
    <button
      type="button"
      onClick={() => onOpen(result)}
      className="flex w-full items-start gap-2 rounded px-1 py-0.5 text-left hover:bg-ink/5 cursor-pointer"
      title={`Open ${file}:${result.line}`}
    >
      <span className="w-6 flex-shrink-0 text-right font-mono text-ink/40">{result.line}</span>
      {preview ? (
        <span className="min-w-0 truncate font-mono text-ink">
          {replacePreviewSegments(result.content, ranges, replacement).map((segment, index) =>
            segment.kind === 'plain' ? (
              <span key={index}>{segment.text}</span>
            ) : segment.kind === 'removed' ? (
              <del key={index} className="search-replace-old">
                {segment.text}
              </del>
            ) : (
              <ins key={index} className="search-replace-new">
                {segment.text}
              </ins>
            ),
          )}
        </span>
      ) : (
        <span
          className="min-w-0 truncate font-mono text-ink"
          // The markup comes from Shiki and the mark splicer, which escape
          // every character of the file's own text on the way in.
          dangerouslySetInnerHTML={{
            __html: highlightCode(result.content, getLanguageFromPath(file), { marks: ranges }),
          }}
        />
      )}
    </button>
  );
}
