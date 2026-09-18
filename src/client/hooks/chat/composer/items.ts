import { useEffect, useState } from 'preact/hooks';
import type { ComposerPickItem, ComposerPickKind } from '@/shared/types';
import { loadComposerItems } from '@/shared/lib/chat/composer/client';

interface ComposerItemsState {
  items: ComposerPickItem[];
  loading: boolean;
  error: string | null;
}

/** Fetch composer pick items for a kind; null kind skips the fetch. */
export function useComposerItems(
  kind: ComposerPickKind | null,
  root?: string | null,
): ComposerItemsState {
  const [state, setState] = useState<ComposerItemsState>({ items: [], loading: false, error: null });

  useEffect(() => {
    if (!kind) {
      setState({ items: [], loading: false, error: null });
      return;
    }

    let cancelled = false;
    setState({ items: [], loading: true, error: null });

    loadComposerItems(kind, root ?? null)
      .then((items) => {
        if (cancelled) return;
        setState({ items, loading: false, error: null });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setState({
          items: [],
          loading: false,
          error: err instanceof Error ? err.message : String(err),
        });
      });

    return () => {
      cancelled = true;
    };
  }, [kind, root]);

  return state;
}
