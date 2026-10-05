import { BarChart3, BookOpen, Bot, ClipboardList, Files, GitBranch, Globe, Layers, ListTodo, Search, Terminal } from 'lucide-preact';
import type { ReactNode } from 'preact/compat';
import type { RightPanelType } from '@/shared/lib/workspace/right-panels';

/**
 * Icon, title and chip label per built-in right-panel view.
 *
 * One table for both layouts. The desktop activity bar shows the title as its
 * tooltip and the phone's tab bar shows the label as its chip, and they were
 * two literal objects that had to agree by hand — which is how a view ends up
 * called "Source Control" in one layout and "GIT" in the other for no reason.
 *
 * The ORDER is not here either: it comes from RIGHT_PANEL_TYPES, the same list
 * the desktop bar, the phone's tab bar and the width map all read.
 */
export const PANEL_META: Record<RightPanelType, { title: string; label: string; icon: ReactNode }> = {
  context: { title: 'Context & Telemetry', label: 'Context', icon: <Layers size={16} /> },
  files: { title: 'Files', label: 'Files', icon: <Files size={16} /> },
  search: { title: 'Search', label: 'Search', icon: <Search size={16} /> },
  git: { title: 'Source Control', label: 'GIT', icon: <GitBranch size={16} /> },
  terminal: { title: 'Terminal (Bun)', label: 'Terminal', icon: <Terminal size={16} /> },
  'user-browser': { title: 'Browser (Anda)', label: 'Browser', icon: <Globe size={16} /> },
  browser: { title: 'Browser Agent', label: 'Agent', icon: <Bot size={16} /> },
  usage: { title: 'Usage', label: 'Usage', icon: <BarChart3 size={16} /> },
  todo: { title: 'Todos', label: 'Todos', icon: <ListTodo size={16} /> },
  wiki: { title: 'Wiki', label: 'Wiki', icon: <BookOpen size={16} /> },
  plan: { title: 'Plan (sesi ini)', label: 'Plan', icon: <ClipboardList size={16} /> },
};
