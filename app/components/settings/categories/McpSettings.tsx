import React, { useState, useEffect, useMemo } from 'react';
import { useRouteLoaderData } from '@remix-run/react';
import type { McpServerItem, SettingsState } from '@/types';
import type { loader as indexLoader } from '@/routes/_index';
import { McpSidebarList } from '@/components/settings/categories/mcp-settings/SidebarList';
import type { McpProjectOption } from '@/components/settings/categories/mcp-settings/SidebarList';
import { McpDetailPane } from '@/components/settings/categories/mcp-settings/DetailPane';
import { McpImportModal } from '@/components/settings/categories/mcp-settings/ImportModal';

interface McpSettingsProps {
  settings: SettingsState;
  onUpdate: (settings: SettingsState) => void;
}

const GLOBAL_PROJECT: McpProjectOption = { id: 'global', name: 'Global (all projects)', path: '' };

export const McpSettings: React.FC<McpSettingsProps> = () => {
  const rootData = useRouteLoaderData<typeof indexLoader>('routes/_index');
  const projects = useMemo<McpProjectOption[]>(() => {
    const folders = rootData?.folders ?? [];
    const bound = folders.flatMap<McpProjectOption>((folder) =>
      folder.project_path ? [{ id: String(folder.id), name: folder.name, path: folder.project_path }] : [],
    );
    return [GLOBAL_PROJECT, ...bound];
  }, [rootData]);

  const [servers, setServers] = useState<McpServerItem[]>([]);
  const [selectedServerId, setSelectedServerId] = useState<string | null>(null);
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [selectedProject, setSelectedProject] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const query = selectedProject ? `?project=${encodeURIComponent(selectedProject)}` : '';
    fetch(`/api/settings/mcp${query}`)
      .then(res => res.json())
      .then(data => {
        if (!active) return;
        const list: McpServerItem[] = Array.isArray(data?.servers) ? data.servers : [];
        setServers(list);
        setSelectedServerId(prev => (prev && list.some(s => s.id === prev) ? prev : list[0]?.id ?? null));
      })
      .catch(err => console.error('Failed to load MCP servers from API:', err))
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => { active = false; };
  }, [selectedProject]);

  const handleAddNewServer = () => {
    setIsCreatingNew(true);
    setSelectedServerId(null);
  };

  const handleSelectServer = (serverId: string) => {
    setIsCreatingNew(false);
    setSelectedServerId(serverId);
  };

  const handleSaveServer = (updated: McpServerItem) => {
    const targetServer: McpServerItem = isCreatingNew
      ? { ...updated, id: `mcp-${Date.now()}` }
      : updated;

    fetch('/api/settings/mcp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(selectedProject ? { server: targetServer, projectPath: selectedProject } : { server: targetServer }),
    })
      .then(res => res.json())
      .then(data => {
        if (data?.error) {
          console.error('Failed to save MCP server via API:', data.error);
          return;
        }
        const list: McpServerItem[] | null = Array.isArray(data?.servers) ? data.servers : null;
        if (list) {
          setServers(list);
          const saved = list.find(s => s.name.toLowerCase() === targetServer.name.toLowerCase());
          setSelectedServerId(saved?.id ?? targetServer.id);
        }
        setIsCreatingNew(false);
      })
      .catch(err => console.error('Failed to save MCP server via API:', err));
  };

  const handleDeleteServer = (serverId: string) => {
    const params = new URLSearchParams({ id: serverId });
    if (selectedProject) params.set('projectPath', selectedProject);
    fetch(`/api/settings/mcp?${params.toString()}`, { method: 'DELETE' })
      .then(res => res.json())
      .then(data => {
        if (data?.error) {
          console.error('Failed to delete MCP server via API:', data.error);
          return;
        }
        const list: McpServerItem[] = Array.isArray(data?.servers) ? data.servers : servers.filter(s => s.id !== serverId);
        setServers(list);
        if (selectedServerId === serverId) {
          setSelectedServerId(list[0]?.id ?? null);
        }
      })
      .catch(err => console.error('Failed to delete MCP server via API:', err));
  };

  const handleImportServer = (imported: McpServerItem) => {
    handleSaveServer(imported);
  };

  const selectedServer = servers.find((s) => s.id === selectedServerId) || servers[0];

  const emptyServerTemplate: McpServerItem = {
    id: `new-${Date.now()}`,
    name: 'new-mcp-server',
    scope: 'every-project',
    enabled: true,
    reachType: 'command',
    commandArgs: ['npx', '-y', '@modelcontextprotocol/server-everything'],
    envVars: [],
    status: 'active',
  };

  if (isLoading) {
    return (
      <div className="flex h-full w-full items-center justify-center text-xs text-ink/40">
        Loading MCP servers from database...
      </div>
    );
  }

  return (
    <div className="flex h-full w-full overflow-hidden bg-paper">
      <McpSidebarList
        servers={servers}
        projects={projects}
        selectedServerId={isCreatingNew ? null : selectedServerId}
        onSelectServer={handleSelectServer}
        onAddNewServer={handleAddNewServer}
        selectedProject={selectedProject}
        onChangeProject={setSelectedProject}
      />

      <div className="flex-1 h-full overflow-hidden flex flex-col">
        {isCreatingNew ? (
          <McpDetailPane
            server={emptyServerTemplate}
            isNew={true}
            onSave={handleSaveServer}
            onOpenImportModal={() => setIsImportModalOpen(true)}
          />
        ) : selectedServer ? (
          <McpDetailPane
            key={selectedServer.id}
            server={selectedServer}
            isNew={false}
            onSave={handleSaveServer}
            onDelete={handleDeleteServer}
            onOpenImportModal={() => setIsImportModalOpen(true)}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center text-xs font-mono text-ink/40">
            Select an MCP server or click + to configure one
          </div>
        )}
      </div>

      <McpImportModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        onImport={handleImportServer}
      />
    </div>
  );
};
