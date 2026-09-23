import { useEffect, useState } from 'preact/hooks';
import { Check, ChevronLeft, X } from 'lucide-preact';
import type { SettingsCategoryId, SettingsState } from '@/shared/types';
import { mergeChamberSettings } from '@/shared/lib/settings/client';
import { useChamberSettingsWriter } from '@/client/hooks/settings/use-chamber-setting';
import { applyDocumentTheme } from '@/client/hooks/ui/theme';
import { useChamberEvent } from '@/client/hooks/ui/window-event';
import { SETTINGS_CATEGORIES, SettingsSidebar } from '@/client/components/settings/Sidebar';
import { AppearanceSettings } from '@/client/components/settings/categories/AppearanceSettings';
import { ChatSettings } from '@/client/components/settings/categories/ChatSettings';
import { ProjectSettings } from '@/client/components/settings/categories/ProjectSettings';
import { ProviderSettings } from '@/client/components/settings/categories/ProviderSettings';
import { AgentSettings } from '@/client/components/settings/categories/AgentSettings';
import { BehaviorSettings } from '@/client/components/settings/categories/BehaviorSettings';
import { CommandSettings } from '@/client/components/settings/categories/CommandSettings';
import { McpSettings } from '@/client/components/settings/categories/McpSettings';
import { SkillSettings } from '@/client/components/settings/categories/SkillSettings';
import { SkillCatalogSettings } from '@/client/components/settings/categories/SkillCatalogSettings';
import { OtherSettings } from '@/client/components/settings/categories/OtherSettings';
import { OmpSettings } from '@/client/components/settings/categories/OmpSettings';
import { TokenUsageSettings } from '@/client/components/settings/categories/TokenUsageSettings';
import { UsageSettings } from '@/client/components/settings/categories/UsageSettings';
import { NotificationSettings } from '@/client/components/settings/categories/NotificationSettings';

export interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialCategory?: SettingsCategoryId;
  appSettings?: Record<string, any>;
  autoOpenAddProvider?: boolean;
}

const DEFAULT_SETTINGS: SettingsState = {
  binaryPath: '/Users/you/.bun/bin/omp',
  showUpdateNotifications: true,
  agentControlTool: true,
  ompChamberWebTool: true,
  theme: 'paper',
  fontSize: 'standard',
  editorFont: 'JetBrains Mono',
  streamResponses: true,
  streamTransport: 'websocket',
  autoSessionTitle: true,
  expandedThinking: true,
  detailedToolCalls: false,
  notificationsEnabled: true,
  buildFailureAlert: true,
  soundAlerts: true,
  chatCompletionSound: true,
  defaultWorkspacePath: '~/Projects/ompchamber',
  tunnelEnabled: true,
  tunnelSubdomain: 'omp-dev-preview',
  activeProvider: 'claude',
  autoApproveSafeCmds: true,
  autoPatchErrors: true,
  followUpBehavior: 'queue',
  keybindingSend: 'Enter',
  keybindingNewLine: 'Shift + Enter',
  keybindingSteering: 'Ctrl / Cmd + Enter'
};

export function SettingsModal({ 
  isOpen, 
  onClose, 
  initialCategory = 'appearance',
  appSettings = {},
  autoOpenAddProvider = false,
}: SettingsModalProps) {
  const [activeCategory, setActiveCategory] = useState<SettingsCategoryId>(initialCategory);
  const [autoOpenAdd, setAutoOpenAdd] = useState(autoOpenAddProvider);
  const [searchQuery, setSearchQuery] = useState('');
  const [isReloading, setIsReloading] = useState(false);
  const [isMobileDrilled, setIsMobileDrilled] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const writeChamberSettings = useChamberSettingsWriter();

  const [settings, setSettings] = useState<SettingsState>(() =>
    mergeChamberSettings(DEFAULT_SETTINGS, appSettings),
  );

  useEffect(() => {
    if (isOpen) {
      setActiveCategory(initialCategory);
      setAutoOpenAdd(autoOpenAddProvider);
      setIsMobileDrilled(false);
      setSearchQuery('');
    }
  }, [isOpen, initialCategory, autoOpenAddProvider]);

  // Global event listener for direct trigger
  useChamberEvent('omp:open-settings', (e) => {
    const customEvent = e as CustomEvent<{ category?: SettingsCategoryId; autoOpenAdd?: boolean }>;
    if (customEvent.detail?.category) {
      setActiveCategory(customEvent.detail.category);
    }
    if (customEvent.detail?.autoOpenAdd) {
      setAutoOpenAdd(true);
    }
  });

  const handleUpdateSettings = (updater: Partial<SettingsState> | ((prev: SettingsState) => SettingsState)) => {
    setSettings(prev => {
      const next = typeof updater === 'function' ? updater(prev) : { ...prev, ...updater };
      if (typeof document !== 'undefined' && next.theme) {
        applyDocumentTheme(next.theme);
      }
      writeChamberSettings(next);
      return next;
    });
    setToastMessage('Setting was saved');
    setTimeout(() => setToastMessage(null), 3000);
  };

  const handleReloadOmpEngine = () => {
    setIsReloading(true);
    setTimeout(() => {
      setIsReloading(false);
    }, 1200);
  };

  const handleSelectCategory = (catId: SettingsCategoryId) => {
    setActiveCategory(catId);
    setIsMobileDrilled(true);
  };

  if (!isOpen) return null;

  const currentCategoryDef = SETTINGS_CATEGORIES.find(c => c.id === activeCategory) || SETTINGS_CATEGORIES[0];

  const renderCategoryContent = () => {
    switch (activeCategory) {
      case 'appearance':
        return <AppearanceSettings settings={settings} onUpdate={handleUpdateSettings} />;
      case 'chats':
        return <ChatSettings settings={settings} onUpdate={handleUpdateSettings} />;
      case 'projects':
        return <ProjectSettings />;
      case 'providers':
        return (
          <ProviderSettings
            autoOpenAdd={autoOpenAdd}
            onAddModalClose={() => setAutoOpenAdd(false)}
          />
        );
      case 'agents':
        return <AgentSettings settings={settings} onUpdate={handleUpdateSettings} />;
      case 'behavior':
        return <BehaviorSettings />;
      case 'commands':
        return <CommandSettings settings={settings} onUpdate={handleUpdateSettings} />;
      case 'mcp':
        return <McpSettings settings={settings} onUpdate={handleUpdateSettings} />;
      case 'token-usage':
        return <TokenUsageSettings settings={settings} onUpdate={handleUpdateSettings} />;
      case 'notifications':
        return <NotificationSettings settings={settings} onUpdate={handleUpdateSettings} />;
      case 'skills':
        return (
          <SkillSettings
            settings={settings}
            onUpdate={handleUpdateSettings}
            onNavigateToCatalog={() => setActiveCategory('skills-catalog')}
          />
        );
      case 'skills-catalog':
        return <SkillCatalogSettings />;
      case 'omp':
        return <OmpSettings settings={settings} onUpdate={handleUpdateSettings} />;
      case 'usage':
        return <UsageSettings />;
      default:
        return <OtherSettings category={activeCategory} />;
    }
  };

  return (
    <div
      className="fixed inset-0 bg-ink/40 backdrop-blur-[2px] z-50 flex items-center justify-center p-0 md:p-6 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="relative bg-paper border border-ink/15 md:rounded-2xl shadow-2xl w-full h-full md:max-w-4xl lg:max-w-5xl xl:max-w-[1150px] md:h-[782px] md:max-h-[92vh] flex flex-col md:flex-row overflow-hidden text-ink"
        onClick={(e) => e.stopPropagation()}
      >
        {/* DESKTOP VIEW: 2-Column Split */}
        <div className="hidden md:flex w-64 flex-shrink-0 h-full">
          <SettingsSidebar
            activeCategory={activeCategory}
            onSelectCategory={(catId) => setActiveCategory(catId)}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            onReloadOmpEngine={handleReloadOmpEngine}
            isReloading={isReloading}
            className="w-full"
          />
        </div>

        {/* DESKTOP & MOBILE DETAIL VIEW */}
        <div className={`flex-1 flex-col h-full bg-paper overflow-hidden ${isMobileDrilled ? 'flex' : 'hidden md:flex'}`}>
          {/* Header Bar */}
          <div className="h-16 px-6 border-b border-ink/10 flex items-center justify-between flex-shrink-0 bg-paper">
            <div className="flex items-center space-x-3 min-w-0">
              {/* Mobile Back Button */}
              <button
                type="button"
                onClick={() => setIsMobileDrilled(false)}
                className="md:hidden p-1.5 -ml-2 rounded-lg hover:bg-ink/5 active:bg-ink/10 text-ink"
                aria-label="Back to categories"
              >
                <ChevronLeft size={20} />
              </button>

              <div className="truncate">
                <h3 className="font-semibold text-base tracking-tight text-ink leading-tight">
                  {currentCategoryDef.label}
                </h3>
                <p className="text-[11px] text-ink/60 truncate hidden sm:block">
                  {currentCategoryDef.description}
                </p>
              </div>
            </div>

            {/* Modal Close Button */}
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-ink/50 hover:text-ink hover:bg-ink/5 transition-colors cursor-pointer"
              aria-label="Close settings"
            >
              <X size={18} strokeWidth={2.2} />
            </button>
          </div>

          {/* Scrollable Settings Body - Full Width across all categories */}
          <div className={`flex-1 scrollbar-overlay-container scrollbar-overlay-static w-full ${['projects', 'providers', 'agents', 'behavior', 'commands', 'mcp', 'skills', 'skills-catalog', 'usage'].includes(activeCategory) ? 'p-0 flex flex-col' : 'p-6 md:p-8 flex flex-col'}`}>
            <div className="w-full h-full flex-1 flex flex-col">
              {renderCategoryContent()}
            </div>
          </div>
        </div>

        {/* MOBILE CATEGORY LIST VIEW (When not drilled into detail) */}
        <div className={`flex-1 flex-col h-full bg-canvas md:hidden ${isMobileDrilled ? 'hidden' : 'flex'}`}>
          <div className="h-14 px-4 border-b border-ink/10 flex items-center justify-between flex-shrink-0 bg-canvas">
            <span className="font-bold text-sm tracking-tight text-ink">Settings</span>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-ink/50 hover:text-ink"
              aria-label="Close"
            >
              <X size={18} />
            </button>
          </div>

          <div className="flex-1 overflow-hidden">
            <SettingsSidebar
              activeCategory={activeCategory}
              onSelectCategory={handleSelectCategory}
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              onReloadOmpEngine={handleReloadOmpEngine}
              isReloading={isReloading}
              className="w-full border-r-0"
            />
          </div>
        </div>

        {/* Toast Notification */}
        {toastMessage && (
          <div className="absolute bottom-6 left-1/2 transform -translate-x-1/2 bg-ink text-canvas px-4 py-2 rounded-lg text-xs font-semibold shadow-lg animate-in fade-in slide-in-from-bottom-2 z-50 flex items-center space-x-2">
            <Check size={14} className="text-success" />
            <span>{toastMessage}</span>
          </div>
        )}
      </div>
    </div>
  );
}
