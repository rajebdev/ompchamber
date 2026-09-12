import { useEffect, useState } from 'react';
import type { ComposerPickItem, ComposerPickKind } from '@/types';
import { loadComposerItems } from '@/lib/chat/composer/client';

interface ComposerItemsState {
  items: ComposerPickItem[];
  loading: boolean;
  error: string | null;
}

/** Fetch composer pick items for a kind; null kind skips the fetch. */
export function useComposerItems(kind: ComposerPickKind | null): ComposerItemsState {
  const [state, setState] = useState<ComposerItemsState>({ items: [], loading: false, error: null });

  useEffect(() => {
    if (!kind) {
      setState({ items: [], loading: false, error: null });
      return;
    }

    let cancelled = false;
    setState({ items: [], loading: true, error: null });

    loadComposerItems(kind)
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
  }, [kind]);

  return state;
}
