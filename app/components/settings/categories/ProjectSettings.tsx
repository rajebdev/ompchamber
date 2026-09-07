import React, { useState, useEffect } from 'react';
import type { SettingsState, ProjectConfigItem } from '@/types';
import { DEFAULT_PROJECTS_LIST } from '@/data/projectData';
import { ProjectSidebarList } from './project-settings/ProjectSidebarList';
import { ProjectDetailsForm } from './project-settings/ProjectDetailsForm';

interface ProjectSettingsProps {
  settings: SettingsState;
  onUpdate: (updater: Partial<SettingsState> | ((prev: SettingsState) => SettingsState)) => void;
}

export function ProjectSettings({ settings, onUpdate }: ProjectSettingsProps) {
  const [projects, setProjects] = useState<ProjectConfigItem[]>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('omp_projects_config');
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length > 0) {
            return parsed;
          }
        }
      } catch (e) {
        // Fallback to default
      }
    }
    return DEFAULT_PROJECTS_LIST;
  });

  const [selectedProjectId, setSelectedProjectId] = useState<string>(() => {
    return projects[0]?.id || 'proj-workspace';
  });

  // Save changes to localStorage and optionally to server settings
  const persistProjects = (updated: ProjectConfigItem[]) => {
    setProjects(updated);
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('omp_projects_config', JSON.stringify(updated));
        // Also persist to app_settings endpoint asynchronously
        fetch('/api/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ omp_projects_config: updated }),
        }).catch(() => {
          // Silent catch if offline or dev runner
        });
      } catch (e) {
        // Ignore storage errors
      }
    }
  };

  const selectedProject = projects.find((p) => p.id === selectedProjectId) || projects[0];

  const handleAddProject = () => {
    const newIndex = projects.length + 1;
    const newName = `Project ${newIndex}`;
    const newProject: ProjectConfigItem = {
      id: `proj-${Date.now()}`,
      name: newName,
      path: `/Users/rajebdev/JatisMobile/${newName}`,
      model: 'Not selected',
      accentColor: '#38bdf8',
      icon: 'default',
    };

    const updated = [...projects, newProject];
    persistProjects(updated);
    setSelectedProjectId(newProject.id);
  };

  const handleDeleteProject = () => {
    if (projects.length <= 1) return;
    const updated = projects.filter((p) => p.id !== selectedProjectId);
    persistProjects(updated);
    setSelectedProjectId(updated[0]?.id || '');
  };

  const handleUpdateField = <K extends keyof ProjectConfigItem>(
    field: K,
    value: ProjectConfigItem[K]
  ) => {
    if (!selectedProject) return;
    const updated = projects.map((p) => {
      if (p.id === selectedProject.id) {
        return { ...p, [field]: value };
      }
      return p;
    });
    persistProjects(updated);
  };

  return (
    <div className="w-full h-full flex flex-col md:flex-row overflow-hidden bg-paper text-ink">
      {/* Left Column: Project list with counter & Add button */}
      <ProjectSidebarList
        projects={projects}
        selectedProjectId={selectedProject?.id || ''}
        onSelectProject={setSelectedProjectId}
        onAddProject={handleAddProject}
      />

      {/* Right Column: Project details & controls */}
      {selectedProject && (
        <ProjectDetailsForm
          project={selectedProject}
          canDelete={projects.length > 1}
          onUpdateField={handleUpdateField}
          onDeleteProject={handleDeleteProject}
        />
      )}
    </div>
  );
}
