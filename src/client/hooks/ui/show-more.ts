/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * "Show more" pagination shared by the desktop workspace category and the
 * mobile workspace item. Both reveal the same counts (initial 5, step 7), so
 * the numbers live here rather than being repeated per call site.
 */

import { useCallback, useState } from 'preact/hooks';

export interface ShowMore {
  visibleCount: number;
  showMore: () => void;
}

export function useShowMore(initial = 5, step = 7): ShowMore {
  const [visibleCount, setVisibleCount] = useState(initial);
  const showMore = useCallback(() => setVisibleCount((c) => c + step), [step]);
  return { visibleCount, showMore };
}
