/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Body of an omp hashline `edit`: the ops the model sent, with their added
 * lines. omp only reports the applied diff on the toolResult
 * (`details.diff`/`details.patch`), so this view is what the Edit panel shows
 * while the call streams and whenever a result carries no diff at all.
 */

import { useMemo } from 'preact/hooks';
import type { HashlineSection, HashlineVerb } from '@/shared/lib/omp/session/hashline-patch';
import { getLanguageFromPath } from '@/shared/lib/code/language';
import { highlightLines } from '@/shared/lib/code/syntax-highlight';
import { useSyntaxReady } from '@/client/hooks/ui/syntax-ready';

/** A hashline `CUT` removes lines the model already saw, so it reads as the
 *  destructive half of the patch; `PUT` carries the replacement body. */
function opTone(verb: HashlineVerb): string {
  return verb === 'CUT' ? 'bg-error/10 text-error' : 'bg-success/10 text-success';
}

export function HashlinePatch({ sections }: { sections: HashlineSection[] }) {
  const syntaxReady = useSyntaxReady();

  const htmlByOp = useMemo(() => {
    return sections.map((section) => {
      const lang = getLanguageFromPath(section.path);
      return section.ops.map((op) => highlightLines(op.body.join('\n'), lang));
    });
  }, [sections, syntaxReady]);

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-[9.5px] font-semibold uppercase tracking-[0.14em] text-ink/40">
        <span>Hashline Patch</span>
        {sections[0].tag && (
          <span className="font-mono text-[9px] font-normal tracking-normal text-ink/50">
            snapshot {sections[0].tag}
          </span>
        )}
      </div>
      <div className="overflow-hidden rounded-lg border border-ink/8">
        {sections.map((section, secIdx) => (
          <div key={section.path} className="border-b border-ink/6 last:border-b-0">
            <div className="flex min-w-0 items-center gap-2 bg-canvas/40 px-2.5 py-1.5">
              <span className="truncate font-mono text-[10.5px] font-medium text-ink">{section.path}</span>
              {section.moveTo && (
                <span className="shrink-0 font-mono text-[10px] text-ink/50">→ {section.moveTo}</span>
              )}
              {section.removed && (
                <span className="shrink-0 rounded bg-error/10 px-1.5 font-mono text-[9px] uppercase tracking-wider text-error">
                  Removes file
                </span>
              )}
            </div>
            <div className="overflow-x-auto">
              {section.ops.map((op, index) => (
                <div key={`${op.verb}-${op.spec}-${index}`}>
                  <div className="flex items-center gap-2 px-2.5 py-1">
                    <span className={`shrink-0 rounded px-1.5 font-mono text-[9px] font-semibold ${opTone(op.verb)}`}>
                      {op.verb}
                    </span>
                    {op.spec && <span className="font-mono text-[10.5px] text-ink/70">{op.spec}</span>}
                  </div>
                  {op.body.map((row, rowIndex) => {
                    const html = htmlByOp[secIdx]?.[index]?.[rowIndex] || '';
                    return html ? (
                      <div
                        key={rowIndex}
                        className="shiki whitespace-pre bg-success/[0.05] px-2.5 font-mono text-[11px] leading-relaxed"
                        dangerouslySetInnerHTML={{ __html: html }}
                      />
                    ) : (
                      <div
                        key={rowIndex}
                        className="whitespace-pre bg-success/[0.05] px-2.5 font-mono text-[11px] leading-relaxed text-success/90"
                      >
                        {row}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
