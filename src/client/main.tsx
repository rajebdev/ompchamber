import { hydrate } from 'preact';
import { App } from '@/client/App';
import { bootSyntax } from '@/shared/lib/code/highlighter';
import { primeChamberSettings } from '@/shared/lib/settings/client';

import '@/client/tailwind.css';
import 'katex/dist/katex.min.css';
import '@fontsource/fira-code/400.css';
import '@fontsource/fira-code/500.css';
import '@fontsource/fira-code/600.css';
import '@fontsource/fira-code/700.css';

const root = document.getElementById('app');
const bootstrap = window.__OMP_BOOTSTRAP__;

primeChamberSettings(bootstrap?.appSettings);

// Fire-and-forget: warms the Shiki highlighter in parallel with hydration.
bootSyntax();

if (root) {
  hydrate(<App initialIsMobile={bootstrap?.initialIsMobile} appSettings={bootstrap?.appSettings} />, root);
}
