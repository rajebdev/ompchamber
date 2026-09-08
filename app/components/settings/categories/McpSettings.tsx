import React, { useState, useEffect } from 'react';
import type { McpServerItem, SettingsState } from '@/types';
import { McpSidebarList } from '@/components/settings/categories/mcp-settings/McpSidebarList';
import { McpDetailPane } from '@/components/settings/categories/mcp-settings/McpDetailPane';
import { McpImportModal } from '@/components/settings/categories/mcp-settings/McpImportModal';

interface McpSettingsProps {
  settings: SettingsState;
  onUpdate: (settings: SettingsState) => void;
}

export const McpSettings: React.FC<McpSettingsProps> = () => {
  const [servers, setServers] = useState<McpServerItem[]>([]);
  const [selectedServerId, setSelectedServerId] = useState<string | null>(null);
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [selectedProject, setSelectedProject] = useState('ompchamber');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let active = true;
    fetch('/api/settings/mcp')
      .then(res => res.json())
      .then(data => {
        if (!active) return;
        const list = data?.servers || [];
        setServers(list);
        if (list.length > 0) {
          setSelectedServerId(list[0].id);
        }
      })
      .catch(err => console.error('Failed to load MCP servers from API:', err))
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => { active = false; };
  }, []);

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
      body: JSON.stringify({ server: targetServer }),
    })
      .then(res => res.json())
      .then(data => {
        if (data?.servers) {
          setServers(data.servers);
        } else {
          setServers(prev => {
            const exists = prev.some(s => s.id === targetServer.id);
            return exists ? prev.map(s => s.id === targetServer.id ? targetServer : s) : [...prev, targetServer];
          });
        }
        setSelectedServerId(targetServer.id);
        setIsCreatingNew(false);
      })
      .catch(err => console.error('Failed to save MCP server via API:', err));
  };

  const handleDeleteServer = (serverId: string) => {
    fetch('/api/settings/mcp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deleteId: serverId }),
    })
      .then(res => res.json())
      .then(data => {
        const nextList = data?.servers || servers.filter(s => s.id !== serverId);
        setServers(nextList);
        if (selectedServerId === serverId) {
          setSelectedServerId(nextList[0]?.id || null);
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
