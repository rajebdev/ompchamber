import React, { useState } from 'react';
import { Plus, Folder, ChevronDown, ChevronRight, Check } from 'lucide-react';
import type { SkillItem } from '@/types';

interface SkillSidebarListProps {
  skills: SkillItem[];
  selectedSkillId: string | null;
  isCreatingNew: boolean;
  onSelectSkill: (id: string) => void;
  onAddNewSkill: () => void;
  selectedProject: string;
  onSelectProject: (project: string) => void;
}

const PROJECT_OPTIONS = [
  { id: 'ompchamber', label: 'ompchamber' },
  { id: 'workspace-edge', label: 'workspace-edge' },
  { id: 'global', label: 'Global (All Projects)' },
];

export function SkillSidebarList({
  skills,
  selectedSkillId,
  isCreatingNew,
  onSelectSkill,
  onAddNewSkill,
  selectedProject,
  onSelectProject,
}: SkillSidebarListProps) {
  const [isProjectDropdownOpen, setIsProjectDropdownOpen] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});

  const toggleGroup = (groupName: string) => {
    setCollapsedGroups((prev) => ({
      ...prev,
      [groupName]: !prev[groupName],
    }));
  };

  // Group skills by group property or standalone
  const groupedSkills: Record<string, SkillItem[]> = {};
  const standaloneSkills: SkillItem[] = [];

  skills.forEach((skill) => {
    if (skill.group) {
      if (!groupedSkills[skill.group]) {
        groupedSkills[skill.group] = [];
      }
      groupedSkills[skill.group].push(skill);
    } else {
      standaloneSkills.push(skill);
    }
  });

  const totalCount = skills.length;

  return (
    <div className="w-56 sm:w-64 border-r border-ink/10 h-full flex flex-col bg-paper/50 flex-shrink-0">
      {/* Project Selector Dropdown */}
      <div className="p-2.5 border-b border-ink/10 relative">
        <button
          type="button"
          onClick={() => setIsProjectDropdownOpen(!isProjectDropdownOpen)}
          className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg border border-ink/20 hover:border-ink/40 bg-paper text-xs text-ink transition-colors cursor-pointer"
        >
          <div className="flex items-center gap-2 truncate">
            <Folder size={14} className="text-ink/60 flex-shrink-0" />
            <span className="truncate font-medium">
              {PROJECT_OPTIONS.find((p) => p.id === selectedProject)?.label || selectedProject}
            </span>
          </div>
          <ChevronDown size={14} className="text-ink/50 flex-shrink-0" />
        </button>

        {isProjectDropdownOpen && (
          <>
            <div
              className="fixed inset-0 z-20"
              onClick={() => setIsProjectDropdownOpen(false)}
            />
            <div className="absolute left-2.5 right-2.5 top-12 z-30 bg-paper border border-ink/15 rounded-lg shadow-lg py-1 animate-in fade-in zoom-in-95 duration-100">
              {PROJECT_OPTIONS.map((proj) => (
                <button
                  key={proj.id}
                  type="button"
                  onClick={() => {
                    onSelectProject(proj.id);
                    setIsProjectDropdownOpen(false);
                  }}
                  className={`w-full text-left px-3 py-1.5 text-xs flex items-center justify-between hover:bg-ink/5 transition-colors cursor-pointer ${
                    selectedProject === proj.id ? 'text-ink font-semibold bg-ink/5' : 'text-ink/70'
                  }`}
                >
                  <span className="truncate">{proj.label}</span>
                  {selectedProject === proj.id && <Check size={12} className="text-ink flex-shrink-0" />}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Counter Header */}
      <div className="px-3.5 py-2.5 border-b border-ink/10 flex items-center justify-between">
        <span className="text-xs font-semibold text-ink">
          Total {totalCount}
        </span>
        <button
          type="button"
          onClick={onAddNewSkill}
          title="Create New Skill"
          className="p-1 rounded-md text-ink/60 hover:text-ink hover:bg-ink/5 transition-colors cursor-pointer"
        >
          <Plus size={15} strokeWidth={2.2} />
        </button>
      </div>

      {/* Skills List */}
      <div className="flex-1 overflow-y-auto p-1.5 space-y-2">
        <div className="px-2 pt-1 pb-0.5 text-[10px] font-bold text-ink/50 uppercase tracking-wider">
          USER SKILLS
        </div>

        {/* Temporary "New Skill" indicator item */}
        {isCreatingNew && (
          <div className="px-2.5 py-1.5 rounded-lg bg-ink/10 text-ink font-medium text-xs shadow-2xs">
            <span className="truncate">new-skill</span>
          </div>
        )}

        {/* Grouped Skills */}
        {Object.entries(groupedSkills).map(([groupName, groupItems]) => {
          const isCollapsed = !!collapsedGroups[groupName];
          return (
            <div key={groupName} className="space-y-0.5">
              <button
                type="button"
                onClick={() => toggleGroup(groupName)}
                className="w-full flex items-center justify-between px-2 py-1 rounded-md text-xs font-semibold text-ink/80 hover:text-ink hover:bg-ink/5 transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-1.5 truncate">
                  {isCollapsed ? (
                    <ChevronRight size={13} className="text-ink/60" />
                  ) : (
                    <ChevronDown size={13} className="text-ink/60" />
                  )}
                  <span className="truncate tracking-tight uppercase text-[11px] font-bold text-ink/90">
                    {groupName}
                  </span>
                </div>
                <span className="text-[10px] font-mono text-ink/50 px-1.5 py-0.2 rounded bg-ink/5">
                  {groupItems.length}
                </span>
              </button>

              {!isCollapsed && (
                <div className="pl-3 space-y-0.5 border-l border-ink/10 ml-2.5">
                  {groupItems.map((skill) => {
                    const isSelected = !isCreatingNew && selectedSkillId === skill.id;
                    return (
                      <button
                        key={skill.id}
                        type="button"
                        onClick={() => onSelectSkill(skill.id)}
                        className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs transition-colors cursor-pointer truncate block ${
                          isSelected
                            ? 'bg-ink/10 text-ink font-medium shadow-2xs'
                            : 'text-ink/70 hover:bg-ink/5 hover:text-ink'
                        }`}
                      >
                        {skill.name}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}

        {/* Standalone Skills */}
        <div className="space-y-0.5 pt-1">
          {standaloneSkills.map((skill) => {
            const isSelected = !isCreatingNew && selectedSkillId === skill.id;
            return (
              <button
                key={skill.id}
                type="button"
                onClick={() => onSelectSkill(skill.id)}
                className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs transition-colors cursor-pointer truncate block ${
                  isSelected
                    ? 'bg-ink/10 text-ink font-medium shadow-2xs'
                    : 'text-ink/70 hover:bg-ink/5 hover:text-ink'
                }`}
              >
                {skill.name}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
