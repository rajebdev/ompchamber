import React, { useState, useEffect } from 'react';
import type { McpServerItem, SettingsState } from '@/types';
import { DEFAULT_MCP_SERVERS } from '@/data/mcpData';
import { McpSidebarList } from './mcp-settings/McpSidebarList';
import { McpDetailPane } from './mcp-settings/McpDetailPane';
import { McpImportModal } from './mcp-settings/McpImportModal';

interface McpSettingsProps {
  settings: SettingsState;
  onUpdate: (settings: SettingsState) => void;
}

const STORAGE_KEY = 'omp_mcp_servers';

export const McpSettings: React.FC<McpSettingsProps> = () => {
  const [servers, setServers] = useState<McpServerItem[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        return JSON.parse(saved);
      }
    } catch {
      // fallback
    }
    return DEFAULT_MCP_SERVERS;
  });

  const [selectedServerId, setSelectedServerId] = useState<string | null>(() => {
    return DEFAULT_MCP_SERVERS[0]?.id || null;
  });

  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [selectedProject, setSelectedProject] = useState('ompchamber');

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(servers));
    } catch {
      // ignore
    }
  }, [servers]);

  const handleAddNewServer = () => {
    setIsCreatingNew(true);
    setSelectedServerId(null);
  };

  const handleSelectServer = (serverId: string) => {
    setIsCreatingNew(false);
    setSelectedServerId(serverId);
  };

  const handleSaveServer = (updated: McpServerItem) => {
    if (isCreatingNew) {
      const newServer: McpServerItem = {
        ...updated,
        id: `mcp-${Date.now()}`,
      };
      setServers((prev) => [...prev, newServer]);
      setSelectedServerId(newServer.id);
      setIsCreatingNew(false);
    } else {
      setServers((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
    }
  };

  const handleDeleteServer = (serverId: string) => {
    const confirm = window.confirm('Are you sure you want to delete this MCP server?');
    if (!confirm) return;

    setServers((prev) => prev.filter((s) => s.id !== serverId));
    if (selectedServerId === serverId) {
      setSelectedServerId(servers[0]?.id || null);
    }
  };

  const handleImportServer = (imported: McpServerItem) => {
    setServers((prev) => [...prev, imported]);
    setSelectedServerId(imported.id);
    setIsCreatingNew(false);
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
