import { useState } from 'preact/hooks';
import type { SettingsState, SkillItem } from '@/shared/types';
import { SkillSidebarList } from '@/client/components/settings/categories/skill-settings/SidebarList';
import { SkillDetailPane } from '@/client/components/settings/categories/skill-settings/DetailPane';
import { LoadingState } from '@/client/components/settings/LoadingState';
import { useCrudList } from '@/client/hooks/settings/crud-list';

interface SkillSettingsProps {
  settings?: SettingsState;
  onUpdate?: (updater: Partial<SettingsState> | ((prev: SettingsState) => SettingsState)) => void;
  onNavigateToCatalog?: () => void;
}

export function SkillSettings({ onNavigateToCatalog }: SkillSettingsProps) {
  const [selectedProjectId, setSelectedProjectId] = useState('ompchamber');
  const { items: skills, selectedId, selected: selectedSkill, isCreatingNew, isLoading, select, startCreate, save, remove } =
    useCrudList<SkillItem, Partial<SkillItem>>({
      endpoint: '/api/settings/skills',
      listKey: 'skills',
      bodyKey: 'skill',
      messages: {
        load: 'Failed to load skills from API:',
        save: 'Failed to save skill via API:',
        delete: 'Failed to delete skill via API:',
      },
      cacheKey: 'command',
      fallbackToFirst: false,
      buildNew: (skillData) => ({
        id: `skill-${Date.now()}`,
        name: skillData.name || 'new-skill',
        description: skillData.description || '',
        location: skillData.location || 'user',
        locationLabel: skillData.locationLabel || 'User / OpenCode',
        instructions: skillData.instructions || '',
        project: selectedProjectId,
      }),
      buildUpdate: (skillData, selected, selectedId) => ({
        ...(selected || { id: selectedId || `skill-${Date.now()}` }),
        ...skillData,
      }) as SkillItem,
      isDeleteError: (data) => Boolean((data as { error?: string } | null)?.error),
    });

  if (isLoading) {
    return <LoadingState>Loading skills from database...</LoadingState>;
  }

  return (
    <div className="flex-1 flex flex-col md:flex-row h-full w-full overflow-hidden bg-paper">
      <SkillSidebarList
        skills={skills}
        selectedSkillId={selectedId}
        isCreatingNew={isCreatingNew}
        onSelectSkill={select}
        onAddNewSkill={startCreate}
        selectedProject={selectedProjectId}
        onSelectProject={setSelectedProjectId}
      />

      <SkillDetailPane
        skill={selectedSkill ?? null}
        isCreatingNew={isCreatingNew}
        onSave={save}
        onDelete={remove}
        onOpenCatalog={onNavigateToCatalog}
      />
    </div>
  );
}
