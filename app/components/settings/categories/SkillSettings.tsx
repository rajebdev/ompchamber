import React, { useState, useEffect } from 'react';
import type { SkillItem, SettingsState } from '@/types';
import { DEFAULT_SKILLS } from '@/data/skillData';
import { SkillSidebarList } from './skill-settings/SkillSidebarList';
import { SkillDetailPane } from './skill-settings/SkillDetailPane';

interface SkillSettingsProps {
  settings?: SettingsState;
  onUpdate?: (updater: Partial<SettingsState> | ((prev: SettingsState) => SettingsState)) => void;
  onNavigateToCatalog?: () => void;
}

export function SkillSettings({ onNavigateToCatalog }: SkillSettingsProps) {
  const [skills, setSkills] = useState<SkillItem[]>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('omp_skills');
        if (saved) return JSON.parse(saved);
      } catch (e) {
        // fallback
      }
    }
    return DEFAULT_SKILLS;
  });

  const [selectedProjectId, setSelectedProjectId] = useState('ompchamber');
  const [selectedSkillId, setSelectedSkillId] = useState<string | null>(() => {
    return DEFAULT_SKILLS[0]?.id || null;
  });
  const [isCreatingNew, setIsCreatingNew] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('omp_skills', JSON.stringify(skills));
    }
  }, [skills]);

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
    if (isCreatingNew) {
      const newSkill: SkillItem = {
        id: `skill-${Date.now()}`,
        name: skillData.name || 'new-skill',
        description: skillData.description || '',
        location: skillData.location || 'user',
        locationLabel: skillData.locationLabel || 'User / OpenCode',
        instructions: skillData.instructions || '',
        project: selectedProjectId,
      };
      setSkills((prev) => [...prev, newSkill]);
      setSelectedSkillId(newSkill.id);
      setIsCreatingNew(false);
    } else if (selectedSkillId) {
      setSkills((prev) =>
        prev.map((s) => (s.id === selectedSkillId ? { ...s, ...skillData } : s))
      );
    }
  };

  const handleDeleteSkill = (id: string) => {
    setSkills((prev) => {
      const updated = prev.filter((s) => s.id !== id);
      if (selectedSkillId === id) {
        setSelectedSkillId(updated[0]?.id || null);
      }
      return updated;
    });
  };

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
