import { useEffect } from 'preact/hooks';
import type { RefObject } from 'preact/compat';

export function useOnClickOutside(
  ref: RefObject<any>,
  handler: (event: globalThis.MouseEvent | globalThis.TouchEvent) => void
) {
  useEffect(() => {
    const listener = (event: globalThis.MouseEvent | globalThis.TouchEvent) => {
      if (!ref.current || ref.current.contains(event.target as Node)) {
        return;
      }
      handler(event);
    };
    document.addEventListener('mousedown', listener);
    document.addEventListener('touchstart', listener);
    return () => {
      document.removeEventListener('mousedown', listener);
      document.removeEventListener('touchstart', listener);
    };
  }, [ref, handler]);
}
