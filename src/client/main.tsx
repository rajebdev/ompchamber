import { hydrate } from 'preact';
import { App } from '@/client/App';
import { bootSyntax } from '@/shared/lib/code/highlighter';
import { primeChamberSettings } from '@/shared/lib/settings/client';

import '@/client/tailwind.css';
import '@/shared/lib/markdown/katex-fonts.css';
import '@/shared/lib/markdown/fira-code-fonts.css';

const root = document.getElementById('app');
const bootstrap = window.__OMP_BOOTSTRAP__;

primeChamberSettings(bootstrap?.appSettings);

// Fire-and-forget: warms the Shiki highlighter in parallel with hydration.
bootSyntax();

if (root) {
  hydrate(<App initialIsMobile={bootstrap?.initialIsMobile} appSettings={bootstrap?.appSettings} />, root);
}
