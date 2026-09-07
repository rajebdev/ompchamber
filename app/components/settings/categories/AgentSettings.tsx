import React, { useState, useEffect } from 'react';
import type { AgentItem, SettingsState } from '@/types';
import { DEFAULT_AGENTS_LIST } from '@/data/agentData';
import { AgentSidebarList } from './agent-settings/AgentSidebarList';
import { AgentDetailPane } from './agent-settings/AgentDetailPane';

interface AgentSettingsProps {
  settings: SettingsState;
  onUpdate: (settings: SettingsState) => void;
}

const STORAGE_KEY = 'omp_agents_settings';

export const AgentSettings: React.FC<AgentSettingsProps> = () => {
  const [agents, setAgents] = useState<AgentItem[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        return JSON.parse(saved);
      }
    } catch {
      // Fallback to default
    }
    return DEFAULT_AGENTS_LIST;
  });

  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(() => {
    return DEFAULT_AGENTS_LIST[0]?.id || null;
  });

  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [selectedProject, setSelectedProject] = useState('ompchamber');

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(agents));
    } catch {
      // Handle storage quota error silently
    }
  }, [agents]);

  const handleAddNewAgent = () => {
    setIsCreatingNew(true);
    setSelectedAgentId(null);
  };

  const handleSelectAgent = (agentId: string) => {
    setIsCreatingNew(false);
    setSelectedAgentId(agentId);
  };

  const handleSaveAgent = (updated: AgentItem) => {
    if (isCreatingNew) {
      const newAgent: AgentItem = {
        ...updated,
        id: `agent-${Date.now()}`,
        isBuiltIn: false,
      };
      setAgents((prev) => [...prev, newAgent]);
      setSelectedAgentId(newAgent.id);
      setIsCreatingNew(false);
    } else {
      setAgents((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
    }
  };

  const handleDeleteAgent = (agentId: string) => {
    const confirm = window.confirm('Are you sure you want to delete this agent?');
    if (!confirm) return;

    setAgents((prev) => prev.filter((a) => a.id !== agentId));
    if (selectedAgentId === agentId) {
      setSelectedAgentId(agents[0]?.id || null);
    }
  };

  const selectedAgent = agents.find((a) => a.id === selectedAgentId) || agents[0];

  const emptyAgentTemplate: AgentItem = {
    id: `new-${Date.now()}`,
    name: 'new-agent',
    description: '',
    scope: 'user',
    mode: 'subagent',
    overrideModel: 'Not selected',
    thinkingVariant: 'default',
    temperature: null,
    topP: null,
    systemPrompt: 'You are a specialized assistant...',
    isBuiltIn: false,
  };

  return (
    <div className="flex h-full w-full overflow-hidden bg-paper">
      <AgentSidebarList
        agents={agents}
        selectedAgentId={isCreatingNew ? null : selectedAgentId}
        onSelectAgent={handleSelectAgent}
        onAddNewAgent={handleAddNewAgent}
        selectedProject={selectedProject}
        onChangeProject={setSelectedProject}
      />

      <div className="flex-1 h-full overflow-hidden flex flex-col">
        {isCreatingNew ? (
          <AgentDetailPane
            agent={emptyAgentTemplate}
            isNew={true}
            onSave={handleSaveAgent}
          />
        ) : selectedAgent ? (
          <AgentDetailPane
            key={selectedAgent.id}
            agent={selectedAgent}
            isNew={false}
            onSave={handleSaveAgent}
            onDelete={handleDeleteAgent}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center text-xs font-mono text-ink/40">
            Select an agent or click + to create one
          </div>
        )}
      </div>
    </div>
  );
};
