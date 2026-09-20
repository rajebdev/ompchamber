import { useEffect, useState } from 'preact/hooks';
import { invalidateComposerCache } from '@/shared/lib/chat/composer/client';

export interface CrudListMessages {
  load: string;
  save: string;
  delete: string;
}

/**
 * Config bag for {@link useCrudList}. The defaults reproduce the plain
 * agent/command/skill shape (GET list → select first, POST `{ [bodyKey]: item }`
 * with optimistic upsert, DELETE `?id=` then refetch). Every override exists so
 * the MCP screen keeps its project-scoped, server-list-only behavior.
 */
export interface CrudListConfig<T extends { id: string }, D = T> {
  endpoint: string;
  listKey: string;
  bodyKey: string;
  /** Extra query string (with leading `?`) appended to GET (and refetch). */
  query?: string;
  messages: CrudListMessages;
  /** Composer cache key invalidated after a successful save/delete. */
  cacheKey?: string;
  /** Build the item to persist when creating. */
  buildNew: (draft: D) => T;
  /** Build the item to persist when updating. */
  buildUpdate: (draft: D, selected: T | undefined, selectedId: string | null) => T;
  /** Custom POST body. Defaults to `{ [bodyKey]: target }`. */
  buildBody?: (target: T) => unknown;
  /** Custom DELETE query. Defaults to `?id=${encodeURIComponent(id)}`. */
  buildDeleteQuery?: (id: string) => string;
  /** Read the list out of a payload; `null` when absent. Defaults to `data[listKey]`. */
  readList?: (data: unknown) => T[] | null;
  /** Resolve selected id after load. Defaults to the first item or `null`. */
  resolveOnLoad?: (prev: string | null, list: T[]) => string | null;
  /** Resolve selected id after save. Return `undefined` to leave it untouched. */
  resolveOnSave?: (target: T, list: T[] | null) => string | null | undefined;
  /** When true, never optimistically upsert on save. */
  serverListOnly?: boolean;
  /** When true, delete uses the response list instead of refetching. */
  deleteFromResponse?: boolean;
  /** When false, `selected` is undefined if no id matches. Defaults true. */
  fallbackToFirst?: boolean;
  /** Return true to abort save on a payload error (log inside the callback). */
  isSaveError?: (data: unknown) => boolean;
  /** Return true to abort delete on a payload error (log inside the callback). */
  isDeleteError?: (data: unknown) => boolean;
}

export interface CrudListController<T extends { id: string }, D = T> {
  items: T[];
  selectedId: string | null;
  selected: T | undefined;
  isCreatingNew: boolean;
  isLoading: boolean;
  select: (id: string) => void;
  startCreate: () => void;
  save: (draft: D) => void;
  remove: (id: string) => void;
}

function defaultReadList<T>(listKey: string) {
  return (data: unknown): T[] | null => {
    const value = (data as Record<string, unknown> | null | undefined)?.[listKey];
    return Array.isArray(value) ? (value as T[]) : null;
  };
}

/** Shared load/save/delete + selection controller for the settings CRUD screens. */
export function useCrudList<T extends { id: string }, D = T>(
  config: CrudListConfig<T, D>,
): CrudListController<T, D> {
  const { endpoint, listKey, query, messages, cacheKey } = config;
  const [items, setItems] = useState<T[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const readList = config.readList ?? defaultReadList<T>(listKey);

  useEffect(() => {
    let active = true;
    fetch(`${endpoint}${query ?? ''}`)
      .then((res) => res.json())
      .then((data) => {
        if (!active) return;
        const list = readList(data) ?? [];
        setItems(list);
        setSelectedId((prev) =>
          config.resolveOnLoad ? config.resolveOnLoad(prev, list) : list.length > 0 ? list[0].id : null,
        );
      })
      .catch((err) => console.error(messages.load, err))
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [endpoint, query]);

  const selected =
    config.fallbackToFirst === false
      ? items.find((item) => item.id === selectedId)
      : items.find((item) => item.id === selectedId) ?? items[0];

  const select = (id: string) => {
    setIsCreatingNew(false);
    setSelectedId(id);
  };

  const startCreate = () => {
    setIsCreatingNew(true);
    setSelectedId(null);
  };

  const save = (draft: D) => {
    const target = isCreatingNew
      ? config.buildNew(draft)
      : config.buildUpdate(draft, selected, selectedId);
    const body = config.buildBody ? config.buildBody(target) : { [config.bodyKey]: target };
    fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
      .then((res) => res.json())
      .then((data) => {
        if (config.isSaveError?.(data)) return;
        const list = readList(data);
        if (list) {
          setItems(list);
        } else if (!config.serverListOnly) {
          setItems((prev) => {
            const exists = prev.some((item) => item.id === target.id);
            return exists
              ? prev.map((item) => (item.id === target.id ? target : item))
              : [...prev, target];
          });
        }
        const nextId = config.resolveOnSave ? config.resolveOnSave(target, list) : target.id;
        if (nextId !== undefined) setSelectedId(nextId);
        setIsCreatingNew(false);
        if (cacheKey) invalidateComposerCache(cacheKey);
      })
      .catch((err) => console.error(messages.save, err));
  };

  const remove = (id: string) => {
    const deleteQuery = config.buildDeleteQuery
      ? config.buildDeleteQuery(id)
      : `?id=${encodeURIComponent(id)}`;
    fetch(`${endpoint}${deleteQuery}`, { method: 'DELETE' })
      .then((res) => res.json())
      .then((data) => {
        if (config.isDeleteError?.(data)) return;
        if (cacheKey) invalidateComposerCache(cacheKey);
        if (config.deleteFromResponse) {
          const list = readList(data) ?? items.filter((item) => item.id !== id);
          setItems(list);
          if (selectedId === id) setSelectedId(list[0]?.id ?? null);
        } else {
          fetch(`${endpoint}${query ?? ''}`)
            .then((r) => r.json())
            .then((d) => {
              const next = readList(d) ?? [];
              setItems(next);
              if (selectedId === id) setSelectedId(next[0]?.id || null);
            });
        }
      })
      .catch((err) => console.error(messages.delete, err));
  };

  return {
    items,
    selectedId,
    selected,
    isCreatingNew,
    isLoading,
    select,
    startCreate,
    save,
    remove,
  };
}
