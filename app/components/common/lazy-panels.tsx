import { lazy } from 'react';

/**
 * Lazy boundaries for the workspace developer panels. Shared by the desktop
 * WorkspacePanels and the mobile RightSidebar so each panel bundle is fetched
 * only when its tab is actually rendered, and so no module is both statically
 * and dynamically imported (which defeats chunk splitting).
 */
export const LazyFileExplorer = lazy(() =>
  import('@/components/workspace/file-explorer/index').then((m) => ({ default: m.FileExplorer }))
);
export const LazySearchPanel = lazy(() =>
  import('@/components/workspace/SearchPanel').then((m) => ({ default: m.SearchPanel }))
);
export const LazyGitPanel = lazy(() =>
  import('@/components/workspace/git-panel/index').then((m) => ({ default: m.GitPanel }))
);
export const LazyTerminalPanel = lazy(() =>
  import('@/components/workspace/terminal-panel/index').then((m) => ({ default: m.TerminalPanel }))
);
export const LazyContextPanel = lazy(() =>
  import('@/components/workspace/context-panel/index').then((m) => ({ default: m.ContextPanel }))
);
export const LazyBrowserPanel = lazy(() =>
  import('@/components/workspace/browser-panel/index').then((m) => ({ default: m.BrowserPanel }))
);
export const LazyUserBrowserPanel = lazy(() =>
  import('@/components/workspace/user-browser-panel/index').then((m) => ({ default: m.UserBrowserPanel }))
);
export const LazyUsagePanel = lazy(() =>
  import('@/components/workspace/usage-panel/index').then((m) => ({ default: m.UsagePanel }))
);
