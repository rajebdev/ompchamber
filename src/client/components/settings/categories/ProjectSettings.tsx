import { useEffect, useState } from 'preact/hooks';
import type { AccentColorOption, ProjectConfigItem } from '@/shared/types';
import { ProjectSidebarList } from '@/client/components/settings/categories/project-settings/SidebarList';
import { ProjectDetailsForm } from '@/client/components/settings/categories/project-settings/DetailsForm';

export function ProjectSettings() {
  const [projects, setProjects] = useState<ProjectConfigItem[]>([]);
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [accentColorOptions, setAccentColorOptions] = useState<AccentColorOption[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('proj-workspace');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const loadProjects = async () => {
      try {
        const response = await fetch('/api/settings/projects');
        const data = await response.json();
        if (!active) return;
        if (Array.isArray(data?.projects)) {
          setProjects(data.projects);
          setSelectedProjectId((current) =>
            data.projects.some((project: ProjectConfigItem) => project.id === current)
              ? current
              : data.projects[0]?.id || '',
          );
        }
        if (Array.isArray(data?.availableModels)) setAvailableModels(data.availableModels);
        if (Array.isArray(data?.accentColorOptions)) setAccentColorOptions(data.accentColorOptions);
      } catch (error) {
        console.error('Failed to load projects from API:', error);
      } finally {
        if (active) setIsLoading(false);
      }
    };

    void loadProjects();
    return () => { active = false; };
  }, []);

  const persistProjectField = async <K extends keyof ProjectConfigItem>(
    project: ProjectConfigItem,
    field: K,
    value: ProjectConfigItem[K],
  ) => {
    if (project.folderId === undefined) return;
    try {
      const response = await fetch('/api/settings/projects', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project: {
            folderId: project.folderId,
            [field]: value === undefined ? null : value,
          },
        }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      window.dispatchEvent(new CustomEvent('omp:workspace-updated', {
        detail: { folderId: project.folderId },
      }));
    } catch (error) {
      console.error('Failed to save project settings:', error);
    }
  };

  const selectedProject = projects.find((p) => p.id === selectedProjectId) || projects[0];

  const handleAddProject = async () => {
    const newName = `Project ${projects.length + 1}`;
    try {
      const response = await fetch('/api/folders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName }),
      });
      const data = await response.json();
      if (!response.ok || !data?.success) throw new Error(data?.error || `HTTP ${response.status}`);
      const folderId = data.folder?.id;
      if (typeof folderId !== 'number') throw new Error('Created workspace has no folder id');

      const newProject: ProjectConfigItem = {
        id: `folder-${folderId}`,
        folderId,
        name: data.folder.name,
        path: data.folder.project_path || '',
        model: 'Not selected',
        accentColor: '',
        icon: 'default',
        isPinned: false,
        isExpanded: true,
      };
      setProjects((current) => [...current, newProject]);
      setSelectedProjectId(newProject.id);
      window.dispatchEvent(new CustomEvent('omp:workspace-updated', { detail: { folderId } }));
    } catch (error) {
      console.error('Failed to add project:', error);
    }
  };

  const handleDeleteProject = async () => {
    if (projects.length <= 1) return;
    const targetId = selectedProjectId;
    try {
      const response = await fetch(`/api/settings/projects?id=${encodeURIComponent(targetId)}`, {
        method: 'DELETE',
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const updated = projects.filter((project) => project.id !== targetId);
      setProjects(updated);
      setSelectedProjectId(updated[0]?.id || '');
      window.dispatchEvent(new CustomEvent('omp:workspace-updated'));
    } catch (error) {
      console.error('Failed to delete project:', error);
    }
  };

  const handleUpdateField = <K extends keyof ProjectConfigItem>(
    field: K,
    value: ProjectConfigItem[K]
  ) => {
    if (!selectedProject) return;
    setProjects((current) => current.map((project) => (
      project.id === selectedProject.id ? { ...project, [field]: value } : project
    )));
    void persistProjectField(selectedProject, field, value);
  };

  useEffect(() => {
    const handleWorkspaceUpdated = () => {
      void fetch('/api/settings/projects')
        .then((response) => response.json())
        .then((data) => {
          if (Array.isArray(data?.projects)) {
            setProjects(data.projects);
            setSelectedProjectId((current) =>
              data.projects.some((project: ProjectConfigItem) => project.id === current)
                ? current
                : data.projects[0]?.id || '',
            );
          }
        })
        .catch((error: unknown) => {
          console.error('Failed to refresh projects:', error);
        });
    };

    window.addEventListener('omp:workspace-updated', handleWorkspaceUpdated);
    return () => window.removeEventListener('omp:workspace-updated', handleWorkspaceUpdated);
  }, []);

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
