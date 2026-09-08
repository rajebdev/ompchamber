import { useState, useEffect } from 'react';
import type { ProjectConfigItem, AccentColorOption } from '@/types';
import { ProjectSidebarList } from '@/components/settings/categories/project-settings/ProjectSidebarList';
import { ProjectDetailsForm } from '@/components/settings/categories/project-settings/ProjectDetailsForm';

export function ProjectSettings() {
  const [projects, setProjects] = useState<ProjectConfigItem[]>([]);
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [accentColorOptions, setAccentColorOptions] = useState<AccentColorOption[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('proj-workspace');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let active = true;
    fetch('/api/settings/projects')
      .then(res => res.json())
      .then(data => {
        if (!active) return;
        if (data?.projects && Array.isArray(data.projects)) {
          setProjects(data.projects);
          if (data.projects.length > 0) {
            setSelectedProjectId(data.projects[0].id);
          }
        }
        if (data?.availableModels) setAvailableModels(data.availableModels);
        if (data?.accentColorOptions) setAccentColorOptions(data.accentColorOptions);
      })
      .catch(err => console.error('Failed to load projects from API:', err))
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => { active = false; };
  }, []);

  const persistProjects = (updated: ProjectConfigItem[]) => {
    setProjects(updated);
    fetch('/api/settings/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projects: updated }),
    }).catch(err => console.error('Failed to save projects via API:', err));
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
    const targetId = selectedProjectId;
    const updated = projects.filter((p) => p.id !== targetId);
    setProjects(updated);
    setSelectedProjectId(updated[0]?.id || '');

    fetch(`/api/settings/projects?id=${encodeURIComponent(targetId)}`, {
      method: 'DELETE',
    }).catch(err => console.error('Failed to delete project via API:', err));
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

  if (isLoading) {
    return (
      <div className="flex h-full w-full items-center justify-center text-xs text-ink/40">
        Loading projects from database...
      </div>
    );
  }

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
          availableModels={availableModels}
          accentColorOptions={accentColorOptions}
        />
      )}
    </div>
  );
}
