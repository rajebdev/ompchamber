import { useState } from 'preact/hooks';
import type { SettingsState, SkillItem } from '@/shared/types';
import { SkillSidebarList } from '@/client/components/settings/categories/skill-settings/SidebarList';
import { SkillDetailPane } from '@/client/components/settings/categories/skill-settings/DetailPane';
import { LoadingState } from '@/client/components/settings/LoadingState';
import { useCrudList } from '@/client/hooks/settings/crud-list';
import { useSettingsMasterDetail } from '@/client/hooks/settings/master-detail';
import { SettingsMasterDetail } from '@/client/components/settings/master-detail';
import { GLOBAL_SCOPE_ID, useWorkspaceRoots } from '@/client/hooks/settings/workspace-roots';

interface SkillSettingsProps {
  settings?: SettingsState;
  onUpdate?: (updater: Partial<SettingsState> | ((prev: SettingsState) => SettingsState)) => void;
  onNavigateToCatalog?: () => void;
}

export function SkillSettings({ onNavigateToCatalog }: SkillSettingsProps) {
  const masterDetail = useSettingsMasterDetail();
  const roots = useWorkspaceRoots();
  const [selectedRootId, setSelectedRootId] = useState<string>(GLOBAL_SCOPE_ID);
  const [isReloading, setIsReloading] = useState(false);
  const root = roots.rootFor(selectedRootId);
  const query = root ? `?root=${encodeURIComponent(root)}` : '';

  const { items: skills, selectedId, selected: selectedSkill, isCreatingNew, isLoading, select, startCreate, save, remove } =
    useCrudList<SkillItem, Partial<SkillItem>>({
      endpoint: '/api/settings/skills',
      query,
      listKey: 'skills',
      bodyKey: 'skill',
      messages: {
        load: 'Failed to load skills from API:',
        save: 'Failed to save skill via API:',
        delete: 'Failed to delete skill via API:',
      },
      cacheKey: 'command',
      fallbackToFirst: false,
      // The write carries the workspace root, because the draft's own location
      // decides which `.omp/skills` root it lands in.
      buildBody: (target) => ({ skill: target, root }),
      buildNew: (skillData) => ({
        id: `skill-${Date.now()}`,
        name: skillData.name || 'new-skill',
        description: skillData.description || '',
        location: skillData.location || 'user',
        locationLabel: skillData.locationLabel || 'User / omp agent',
        instructions: skillData.instructions || '',
        hidden: skillData.hidden === true,
        project: 'omp',
      }),
      buildUpdate: (skillData, selected, selectedId) => ({
        ...(selected || { id: selectedId || `skill-${Date.now()}` }),
        ...skillData,
      }) as SkillItem,
      isDeleteError: (data) => Boolean((data as { error?: string } | null)?.error),
    });

  const reload = () => {
    setIsReloading(true);
    fetch('/api/settings/skills', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'reload' }),
    })
      .catch((error) => console.error('Failed to reload plugins:', error))
      .finally(() => setIsReloading(false));
  };

  if (isLoading) {
    return <LoadingState>Loading skills…</LoadingState>;
  }

  return (
    <div className="flex-1 flex flex-col h-full w-full overflow-hidden bg-paper">
      <SettingsMasterDetail
        pane={masterDetail.pane}
        onBack={masterDetail.back}
        listLabel="Skills"
        list={
          <SkillSidebarList
            skills={skills}
            selectedSkillId={selectedId}
            isCreatingNew={isCreatingNew}
            onSelectSkill={(id) => {
              select(id);
              masterDetail.openDetail();
            }}
            onAddNewSkill={() => {
              startCreate();
              masterDetail.openDetail();
            }}
            selectedProject={selectedRootId}
            onSelectProject={setSelectedRootId}
            projectOptions={roots.options}
          />
        }
        detail={
          <SkillDetailPane
            skill={selectedSkill ?? null}
            isCreatingNew={isCreatingNew}
            onSave={save}
            onDelete={remove}
            onOpenCatalog={onNavigateToCatalog}
            onReload={reload}
            isReloading={isReloading}
          />
        }
      />
    </div>
  );
}
