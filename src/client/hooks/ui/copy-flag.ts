import { useCallback, useEffect, useRef, useState } from 'preact/hooks';

/**
 * Copied-state flag with an auto-reset timer. Mirrors the copy-to-clipboard
 * feedback used across the chat timeline: show the success state for a short
 * beat, then revert. A pending reset is cancelled on unmount so a late timer
 * never fires against a torn-down component.
 */
export function useCopyFlag(resetMs = 2000) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flagCopied = useCallback(() => {
    setCopied(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setCopied(false), resetMs);
  }, [resetMs]);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  return { copied, flagCopied };
}
