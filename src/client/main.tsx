import { hydrate } from 'preact';
import { App } from '@/client/App';
import { bootSyntax } from '@/shared/lib/code/highlighter';
import { primeChamberSettings } from '@/shared/lib/settings/client';
import { initDocumentTheme } from '@/client/hooks/ui/theme';
import { installAuthFetchBridge, primeAuthState } from '@/client/hooks/ui/auth';
import { installPluginRuntime } from '@/client/lib/plugins/runtime';
import { installUiKit } from '@/client/lib/plugins/kit';

import '@/client/tailwind.css';
import '@/shared/lib/markdown/katex-fonts.css';
import '@/shared/lib/markdown/fira-code-fonts.css';
import '@/shared/lib/fonts/nerd-symbols.css';

const root = document.getElementById('app');
const bootstrap = window.__OMP_BOOTSTRAP__;

// Both before the first render: the auth state decides whether the app or the
// login screen is mounted, and the fetch bridge must be in place before any
// hook issues a request, or a 401 during startup would go unnoticed.
primeAuthState(bootstrap?.authenticated);
installAuthFetchBridge();

primeChamberSettings(bootstrap?.appSettings);

// The catalog stylesheet and both theme attributes, before the first render:
// the server writes them into the shell, so this only repairs a document served
// by an older build.
initDocumentTheme();

// Both BEFORE the first render, and in this order: a plugin bundle reads the
// runtime the moment it is imported, and the UI kit reads the services its
// components call. Neither can wait for a panel to open, because the registry
// read starts the imports as soon as the layout mounts.
installPluginRuntime();
installUiKit();

// Fire-and-forget: warms the Shiki highlighter in parallel with hydration.
bootSyntax();

if (root) {
  hydrate(<App initialIsMobile={bootstrap?.initialIsMobile} appSettings={bootstrap?.appSettings} />, root);
}
