/**
 * The update run's own output, as it arrives.
 *
 * A live install prints the commands it runs and what they answered, and that
 * is the only honest progress signal available — there is no percentage to
 * report. It follows the tail while the run is active so the newest line stays
 * on screen, and stays readable afterwards, because the failure that matters
 * explains itself in the last few lines.
 *
 * Shared by the About modal and the "What's new" popup: both drive the same
 * `useUpdates().progress`, and two copies of this fold's presentation would
 * drift the moment one of them grew a state.
 */

import { useEffect, useRef } from 'preact/hooks';
import { Loader2, Terminal } from 'lucide-preact';
import { updateLogText, type UpdateLogState } from '@/shared/lib/updates/progress';

interface UpdateLogProps {
  state: UpdateLogState;
  /** A run is in flight: the label says so and the tail keeps following it. */
  active: boolean;
}

export function UpdateLog({ state, active }: UpdateLogProps) {
  const scroller = useRef<HTMLPreElement>(null);
  const text = updateLogText(state);

  useEffect(() => {
    const element = scroller.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [text]);

  if (!text && !active) return null;

  return (
    <div className="mt-2.5">
      <div className="mb-1 flex items-center gap-1.5 text-[10px] text-ink/50">
        {active ? (
          <Loader2 size={11} className="animate-spin motion-reduce:animate-none" />
        ) : (
          <Terminal size={11} />
        )}
        <span>{active ? 'Updating…' : 'Update output'}</span>
        {state.truncated && <span className="text-ink/35">· older lines trimmed</span>}
      </div>
      <pre
        ref={scroller}
        className="max-h-40 overflow-auto rounded-md border border-ink/10 bg-canvas px-2 py-1.5 font-mono text-[10px] leading-4 whitespace-pre-wrap break-words text-ink/70 select-text"
      >
        {text || '…'}
      </pre>
    </div>
  );
}
