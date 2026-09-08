import { useState, useEffect } from 'react';
import type { SkillItem, SettingsState } from '@/types';
import { SkillSidebarList } from '@/components/settings/categories/skill-settings/SkillSidebarList';
import { SkillDetailPane } from '@/components/settings/categories/skill-settings/SkillDetailPane';

interface SkillSettingsProps {
  settings?: SettingsState;
  onUpdate?: (updater: Partial<SettingsState> | ((prev: SettingsState) => SettingsState)) => void;
  onNavigateToCatalog?: () => void;
}

export function SkillSettings({ onNavigateToCatalog }: SkillSettingsProps) {
  const [skills, setSkills] = useState<SkillItem[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState('ompchamber');
  const [selectedSkillId, setSelectedSkillId] = useState<string | null>(null);
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let active = true;
    fetch('/api/settings/skills')
      .then(res => res.json())
      .then(data => {
        if (!active) return;
        const list = data?.skills || [];
        setSkills(list);
        if (list.length > 0) {
          setSelectedSkillId(list[0].id);
        }
      })
      .catch(err => console.error('Failed to load skills from API:', err))
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => { active = false; };
  }, []);

  const selectedSkill = skills.find((s) => s.id === selectedSkillId) || null;

  const handleSelectSkill = (id: string) => {
    setSelectedSkillId(id);
    setIsCreatingNew(false);
  };

  const handleAddNewSkill = () => {
    setIsCreatingNew(true);
    setSelectedSkillId(null);
  };

  const handleSaveSkill = (skillData: Partial<SkillItem>) => {
    const targetSkill: SkillItem = isCreatingNew
      ? {
          id: `skill-${Date.now()}`,
          name: skillData.name || 'new-skill',
          description: skillData.description || '',
          location: skillData.location || 'user',
          locationLabel: skillData.locationLabel || 'User / OpenCode',
          instructions: skillData.instructions || '',
          project: selectedProjectId,
        }
      : {
          ...(selectedSkill || { id: selectedSkillId || `skill-${Date.now()}` }),
          ...skillData,
        } as SkillItem;

    fetch('/api/settings/skills', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ skill: targetSkill }),
    })
      .then(res => res.json())
      .then(data => {
        if (data?.skills) {
          setSkills(data.skills);
        } else {
          setSkills(prev => {
            const exists = prev.some(s => s.id === targetSkill.id);
            return exists ? prev.map(s => s.id === targetSkill.id ? targetSkill : s) : [...prev, targetSkill];
          });
        }
        setSelectedSkillId(targetSkill.id);
        setIsCreatingNew(false);
      })
      .catch(err => console.error('Failed to save skill via API:', err));
  };

  const handleDeleteSkill = (id: string) => {
    fetch('/api/settings/skills', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deleteId: id }),
    })
      .then(res => res.json())
      .then(data => {
        const nextList = data?.skills || skills.filter(s => s.id !== id);
        setSkills(nextList);
        if (selectedSkillId === id) {
          setSelectedSkillId(nextList[0]?.id || null);
        }
      })
      .catch(err => console.error('Failed to delete skill via API:', err));
  };

  if (isLoading) {
    return (
      <div className="flex h-full w-full items-center justify-center text-xs text-ink/40">
        Loading skills from database...
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col md:flex-row h-full w-full overflow-hidden bg-paper">
      <SkillSidebarList
        skills={skills}
        selectedSkillId={selectedSkillId}
        isCreatingNew={isCreatingNew}
        onSelectSkill={handleSelectSkill}
        onAddNewSkill={handleAddNewSkill}
        selectedProject={selectedProjectId}
        onSelectProject={setSelectedProjectId}
      />

      <SkillDetailPane
        skill={selectedSkill}
        isCreatingNew={isCreatingNew}
        onSave={handleSaveSkill}
        onDelete={handleDeleteSkill}
        onOpenCatalog={onNavigateToCatalog}
      />
    </div>
  );
}
