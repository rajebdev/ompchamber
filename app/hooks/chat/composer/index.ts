import React, { useCallback, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { ComposerMatchItem, ComposerPickItem, ComposerTrigger } from '@/types';
import { detectComposerTrigger, insertToken, tokenForItem } from '@/lib/chat/composer/trigger';
import { filterComposerItems } from '@/lib/chat/composer/filter';
import { useComposerItems } from '@/hooks/chat/composer/items';

export interface UseComposerTriggerOptions {
  value: string;
  setValue: (value: string) => void;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  disabled?: boolean;
  /** Workspace root to scope `@` file mentions to (null → app root). */
  rootPath?: string | null;
}

export interface ComposerTriggerController {
  trigger: ComposerTrigger | null;
  isOpen: boolean;
  matches: ComposerMatchItem[];
  loading: boolean;
  error: string | null;
  activeIndex: number;
  setActiveIndex: (index: number) => void;
  handleChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  handleCompositionStart: () => void;
  handleCompositionEnd: () => void;
  handleKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => boolean;
  selectItem: (item: ComposerPickItem) => void;
  close: () => void;
  listboxId: string;
  optionId: (index: number) => string;
}

function isComposingInput(native: Event): boolean {
  const input = native as InputEvent;
  return (
    input.isComposing === true ||
    input.inputType?.startsWith('insertFromPaste') === true ||
    input.inputType?.startsWith('insertFromDrop') === true
  );
}

/** Orchestrates the composer `@`-agent / `/`-command autocomplete flow. */
export function useComposerTrigger(options: UseComposerTriggerOptions): ComposerTriggerController {
  const { value, setValue, textareaRef, disabled = false, rootPath } = options;

  const [trigger, setTrigger] = useState<ComposerTrigger | null>(null);
  const [activeIndex, setActiveIndexState] = useState(0);
  const composingRef = useRef(false);
  const pendingCaretRef = useRef<number | null>(null);

  const { items, loading, error } = useComposerItems(trigger?.kind ?? null, rootPath ?? null);

  const matches = useMemo(
    () => filterComposerItems(items, trigger?.query ?? ''),
    [items, trigger?.query],
  );

  const clampedIndex = matches.length > 0
    ? Math.min(Math.max(activeIndex, 0), matches.length - 1)
    : -1;

  const listboxId = useId();

  const optionId = useCallback((index: number) => `${listboxId}-option-${index}`, [listboxId]);

  const close = useCallback(() => {
    setTrigger(null);
    setActiveIndexState(0);
  }, []);

  const setActiveIndex = useCallback((index: number) => {
    setActiveIndexState(index);
  }, []);

  const handleCompositionStart = useCallback(() => {
    composingRef.current = true;
  }, []);

  const handleCompositionEnd = useCallback(() => {
    composingRef.current = false;
  }, []);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const el = e.target;
      const text = el.value;
      const caret = el.selectionStart ?? text.length;

      if (composingRef.current || isComposingInput(e.nativeEvent)) {
        setValue(text);
        close();
        return;
      }

      setValue(text);
      if (disabled) {
        close();
        return;
      }
      setTrigger(detectComposerTrigger(text, caret));
      setActiveIndexState(0);
    },
    [setValue, close, disabled],
  );

  const selectItem = useCallback(
    (item: ComposerPickItem) => {
      if (!trigger) return;
      const next = insertToken(value, trigger, tokenForItem(item));
      pendingCaretRef.current = next.caret;
      setValue(next.value);
      close();
    },
    [value, trigger, setValue, close],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>): boolean => {
      if (composingRef.current || e.keyCode === 229) return false;
      if (!trigger) return false;

      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        if (matches.length > 0) {
          const delta = e.key === 'ArrowDown' ? 1 : -1;
          setActiveIndexState((clampedIndex + delta + matches.length) % matches.length);
        }
        return true;
      }

      if ((e.key === 'Enter' || e.key === 'Tab') && matches.length > 0) {
        e.preventDefault();
        e.stopPropagation();
        selectItem(matches[clampedIndex]);
        return true;
      }

      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        close();
        return true;
      }

      return false;
    },
    [trigger, matches, clampedIndex, selectItem, close],
  );

  useLayoutEffect(() => {
    if (pendingCaretRef.current == null) return;
    const caret = pendingCaretRef.current;
    pendingCaretRef.current = null;
    const el = textareaRef.current;
    if (el) {
      el.focus();
      el.setSelectionRange(caret, caret);
    }
  }, [value, textareaRef]);

  return {
    trigger,
    isOpen: trigger !== null,
    matches,
    loading,
    error,
    activeIndex: clampedIndex,
    setActiveIndex,
    handleChange,
    handleCompositionStart,
    handleCompositionEnd,
    handleKeyDown,
    selectItem,
    close,
    listboxId,
    optionId,
  };
}
