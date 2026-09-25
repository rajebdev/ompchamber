import { lazy } from 'preact/compat';
import type { ComponentType } from 'preact/compat';
import type { RightPanelType } from '@/shared/lib/workspace/right-panels';

/**
 * Lazy boundaries for the workspace developer panels. Shared by the desktop
 * WorkspacePanels and the mobile RightSidebar so each panel bundle is fetched
 * only when its tab is actually rendered, and so no module is both statically
 * and dynamically imported (which defeats chunk splitting).
 */
export const LazyFileExplorer = lazy(() =>
  import('@/client/components/workspace/file-explorer/index').then((m) => ({ default: m.FileExplorer }))
);
export const LazySearchPanel = lazy(() =>
  import('@/client/components/workspace/SearchPanel').then((m) => ({ default: m.SearchPanel }))
);
export const LazyGitPanel = lazy(() =>
  import('@/client/components/workspace/git-panel/index').then((m) => ({ default: m.GitPanel }))
);
export const LazyTerminalPanel = lazy(() =>
  import('@/client/components/workspace/terminal-panel/index').then((m) => ({ default: m.TerminalPanel }))
);
export const LazyContextPanel = lazy(() =>
  import('@/client/components/workspace/context-panel/index').then((m) => ({ default: m.ContextPanel }))
);
export const LazyBrowserPanel = lazy(() =>
  import('@/client/components/workspace/browser-panel/index').then((m) => ({ default: m.BrowserPanel }))
);
export const LazyUserBrowserPanel = lazy(() =>
  import('@/client/components/workspace/user-browser-panel/index').then((m) => ({ default: m.UserBrowserPanel }))
);
export const LazyUsagePanel = lazy(() =>
  import('@/client/components/workspace/usage-panel/index').then((m) => ({ default: m.UsagePanel }))
);
export const LazyTodoPanel = lazy(() =>
  import('@/client/components/workspace/todo-panel/index').then((m) => ({ default: m.TodoPanel }))
);

/**
 * One cached lazy per right-panel view for the desktop layout.
 *
 * `Lazy*` remounts (fresh Suspense, state reset) every time the user switches
 * the right panel back to a view. The workspace panels are stateful — file
 * tree expansion, scroll, terminal buffer, search results — so remounting on
 * every switch throws that work away and forces a re-fetch/re-render. This
 * cache keeps each view mounted (hidden with CSS) so switching panels is
 * instant and a view's state survives while the layout lives.
 *
 * The mobile right sidebar does NOT use these: its tabs mount lazily on
 * demand and close the whole drawer, so caching per-tab state across visits
 * would hold hidden panels on a memory-tight phone for no benefit.
 *
 * The cache is layout-scoped (a WeakMap, module-level): when the desktop
 * layout unmounts, its entries become collectable.
 */
const viewCache = new WeakMap<object, Record<RightPanelType, ComponentType<Record<string, unknown>>>>();

export function getDesktopPanelView(scope: object, view: RightPanelType): ComponentType<Record<string, unknown>> {
  let slots = viewCache.get(scope);
  if (!slots) {
    slots = {} as Record<RightPanelType, ComponentType<Record<string, unknown>>>;
    viewCache.set(scope, slots);
  }
  if (!slots[view]) {
    const Source =
      view === 'files' ? LazyFileExplorer
      : view === 'search' ? LazySearchPanel
      : view === 'git' ? LazyGitPanel
      : view === 'terminal' ? LazyTerminalPanel
      : view === 'context' ? LazyContextPanel
      : view === 'user-browser' ? LazyUserBrowserPanel
      : view === 'browser' ? LazyBrowserPanel
      : view === 'usage' ? LazyUsagePanel
      : LazyTodoPanel;
    const Cached: ComponentType<Record<string, unknown>> = ({ className, ...rest }) => (
      <div className={`w-full h-full ${typeof className === 'string' ? className : ''}`}>
        <Source {...rest} className="w-full h-full" />
      </div>
    );
    Cached.displayName = `CachedView(${view})`;
    slots[view] = Cached;
  }
  return slots[view];
}
