/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState } from 'preact/hooks';

import { isSyntaxReady, onSyntaxReady } from '@/shared/lib/code/highlighter';

/** Re-renders once the Shiki highlighter has finished warming up. */
export function useSyntaxReady(): boolean {
  const [ready, setReady] = useState<boolean>(() => isSyntaxReady());

  useEffect(() => onSyntaxReady(() => setReady(true)), []);

  return ready;
}
