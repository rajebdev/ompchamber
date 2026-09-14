/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Device-viewport presets shared by both browser panels. The agent viewer and
 * the user iframe must frame a page with identical geometry, so the preset
 * classes live here instead of in either panel.
 */

import type { ViewportMode } from '@/types';

export const VIEWPORT_CLASSES: Record<ViewportMode, string> = {
  'desktop-16-9': 'w-full max-w-[1280px] aspect-video max-h-full border border-ink/20 rounded-lg shadow-md overflow-hidden my-auto',
  laptop: 'w-[1024px] max-w-full h-[768px] max-h-full border border-ink/20 rounded-lg shadow-md overflow-hidden my-auto',
  tablet: 'w-[768px] max-w-full h-[1024px] max-h-full border border-ink/20 rounded-lg shadow-md overflow-hidden my-auto',
  mobile: 'w-[375px] max-w-full h-[667px] max-h-full border border-ink/20 rounded-xl shadow-md overflow-hidden my-auto',
  'mobile-lg': 'w-[414px] max-w-full h-[896px] max-h-full border border-ink/20 rounded-xl shadow-md overflow-hidden my-auto',
  responsive: 'w-full h-full border-0',
};
