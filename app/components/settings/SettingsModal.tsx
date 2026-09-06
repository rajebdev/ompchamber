import React, { useState, useEffect } from 'react';
import { X, ChevronLeft } from 'lucide-react';
import type { SettingsCategoryId, SettingsState } from '@/types';
import { SettingsSidebar, SETTINGS_CATEGORIES } from './SettingsSidebar';
import { GeneralSettings } from './categories/GeneralSettings';
import { AppearanceSettings } from './categories/AppearanceSettings';
import { ChatSettings } from './categories/ChatSettings';
import { WorkspaceSettings } from './categories/WorkspaceSettings';
import { OmpSettings } from './categories/OmpSettings';
import { OtherSettings } from './categories/OtherSettings';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialCategory?: SettingsCategoryId;
}

const DEFAULT_SETTINGS: SettingsState = {
  binaryPath: '/Users/you/.bun/bin/omp',
  showUpdateNotifications: true,
  agentControlTool: true,
  ompChamberWebTool: true,
  theme: 'paper',
  fontSize: 'standard',
  editorFont: 'JetBrains Mono',
  autoScrollChat: true,
  streamResponses: true,
  expandedThinking: true,
  detailedToolCalls: false,
  notificationsEnabled: true,
  buildFailureAlert: true,
  soundAlerts: false,
  defaultWorkspacePath: '~/Projects/ompchamber',
  gitAutoFetch: true,
  gitAuthorName: 'AI Oh-My-Pi',
  gitAuthorEmail: 'agent@oh-my-pi.local',
  tunnelEnabled: true,
  tunnelSubdomain: 'omp-dev-preview',
  activeProvider: 'claude',
  autoApproveSafeCmds: true,
  autoPatchErrors: true
};

export function SettingsModal({ isOpen, onClose, initialCategory = 'general' }: SettingsModalProps) {
  const [activeCategory, setActiveCategory] = useState<SettingsCategoryId>(initialCategory);
  const [searchQuery, setSearchQuery] = useState('');
  const [isReloading, setIsReloading] = useState(false);
  const [isMobileDrilled, setIsMobileDrilled] = useState(false);

  // Local persisted settings state
  const [settings, setSettings] = useState<SettingsState>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('omp_chamber_settings');
        if (saved) return { ...DEFAULT_SETTINGS, ...JSON.parse(saved) };
      } catch (e) {
        // fallback
      }
    }
    return DEFAULT_SETTINGS;
  });

  useEffect(() => {
    if (isOpen) {
      setActiveCategory(initialCategory);
      setIsMobileDrilled(false);
      setSearchQuery('');
    }
  }, [isOpen, initialCategory]);

  const handleUpdateSettings = (updater: Partial<SettingsState> | ((prev: SettingsState) => SettingsState)) => {
    setSettings(prev => {
      const next = typeof updater === 'function' ? updater(prev) : { ...prev, ...updater };
      if (typeof window !== 'undefined') {
        localStorage.setItem('omp_chamber_settings', JSON.stringify(next));
      }
      return next;
    });
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
      case 'general':
        return <GeneralSettings settings={settings} onUpdate={handleUpdateSettings} />;
      case 'appearance':
        return <AppearanceSettings settings={settings} onUpdate={handleUpdateSettings} />;
      case 'chat':
        return <ChatSettings settings={settings} onUpdate={handleUpdateSettings} />;
      case 'projects':
      case 'remote-instances':
      case 'external-tunnel':
      case 'git':
        return <WorkspaceSettings category={activeCategory} settings={settings} onUpdate={handleUpdateSettings} />;
      case 'providers':
      case 'agents':
      case 'behavior':
      case 'commands':
      case 'mcp':
        return <OmpSettings category={activeCategory} settings={settings} onUpdate={handleUpdateSettings} />;
      default:
        return <OtherSettings category={activeCategory} settings={settings} onUpdate={handleUpdateSettings} />;
    }
  };

  return (
    <div
      className="fixed inset-0 bg-[#141310]/40 backdrop-blur-[2px] z-50 flex items-center justify-center p-0 md:p-6 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="relative bg-[#faf8f3] border border-[#141310]/15 md:rounded-2xl shadow-2xl w-full h-full md:max-w-4xl md:h-[680px] md:max-h-[90vh] flex flex-col md:flex-row overflow-hidden text-[#141310]"
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
        <div className={`flex-1 flex-col h-full bg-[#faf8f3] overflow-hidden ${isMobileDrilled ? 'flex' : 'hidden md:flex'}`}>
          {/* Header Bar */}
          <div className="h-16 px-6 border-b border-[#141310]/10 flex items-center justify-between flex-shrink-0 bg-[#faf8f3]">
            <div className="flex items-center space-x-3 min-w-0">
              {/* Mobile Back Button */}
              <button
                type="button"
                onClick={() => setIsMobileDrilled(false)}
                className="md:hidden p-1.5 -ml-2 rounded-lg hover:bg-[#141310]/5 active:bg-[#141310]/10 text-[#141310]"
                aria-label="Back to categories"
              >
                <ChevronLeft size={20} />
              </button>

              <div className="truncate">
                <h3 className="font-semibold text-base tracking-tight text-[#141310] leading-tight">
                  {currentCategoryDef.label}
                </h3>
                <p className="text-[11px] text-[#141310]/60 truncate hidden sm:block">
                  {currentCategoryDef.description}
                </p>
              </div>
            </div>

            {/* Modal Close Button */}
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-[#141310]/50 hover:text-[#141310] hover:bg-[#141310]/5 transition-colors cursor-pointer"
              aria-label="Close settings"
            >
              <X size={18} strokeWidth={2.2} />
            </button>
          </div>

          {/* Scrollable Settings Body */}
          <div className="flex-1 overflow-y-auto p-6 md:p-8">
            <div className="max-w-2xl">
              {renderCategoryContent()}
            </div>
          </div>
        </div>

        {/* MOBILE CATEGORY LIST VIEW (When not drilled into detail) */}
        <div className={`flex-1 flex-col h-full bg-[#f4f1ea] md:hidden ${isMobileDrilled ? 'hidden' : 'flex'}`}>
          <div className="h-14 px-4 border-b border-[#141310]/10 flex items-center justify-between flex-shrink-0 bg-[#f4f1ea]">
            <span className="font-bold text-sm tracking-tight text-[#141310]">Settings</span>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-[#141310]/50 hover:text-[#141310]"
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
      </div>
    </div>
  );
}
