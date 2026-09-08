import React, { useState, useEffect } from 'react';
import type { AgentItem, SettingsState } from '@/types';
import { AgentSidebarList } from '@/components/settings/categories/agent-settings/AgentSidebarList';
import { AgentDetailPane } from '@/components/settings/categories/agent-settings/AgentDetailPane';

interface AgentSettingsProps {
  settings: SettingsState;
  onUpdate: (settings: SettingsState) => void;
}

export const AgentSettings: React.FC<AgentSettingsProps> = () => {
  const [agents, setAgents] = useState<AgentItem[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [selectedProject, setSelectedProject] = useState('ompchamber');
  const [isLoading, setIsLoading] = useState(true);

  // Load from API
  useEffect(() => {
    let active = true;
    fetch('/api/settings/agents')
      .then(res => res.json())
      .then(data => {
        if (!active) return;
        const list = data?.agents || [];
        setAgents(list);
        if (list.length > 0) {
          setSelectedAgentId(list[0].id);
        }
      })
      .catch(err => console.error('Failed to load agents from API:', err))
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => { active = false; };
  }, []);

  const handleAddNewAgent = () => {
    setIsCreatingNew(true);
    setSelectedAgentId(null);
  };

  const handleSelectAgent = (agentId: string) => {
    setIsCreatingNew(false);
    setSelectedAgentId(agentId);
  };

  const handleSaveAgent = (updated: AgentItem) => {
    const targetAgent: AgentItem = isCreatingNew
      ? { ...updated, id: `agent-${Date.now()}`, isBuiltIn: false }
      : updated;

    fetch('/api/settings/agents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agent: targetAgent }),
    })
      .then(res => res.json())
      .then(data => {
        if (data?.agents) {
          setAgents(data.agents);
        } else {
          setAgents(prev => {
            const exists = prev.some(a => a.id === targetAgent.id);
            return exists ? prev.map(a => a.id === targetAgent.id ? targetAgent : a) : [...prev, targetAgent];
          });
        }
        setSelectedAgentId(targetAgent.id);
        setIsCreatingNew(false);
      })
      .catch(err => console.error('Failed to save agent via API:', err));
  };

  const handleDeleteAgent = (agentId: string) => {
    fetch('/api/settings/agents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deleteId: agentId }),
    })
      .then(res => res.json())
      .then(data => {
        const nextList = data?.agents || agents.filter(a => a.id !== agentId);
        setAgents(nextList);
        if (selectedAgentId === agentId) {
          setSelectedAgentId(nextList[0]?.id || null);
        }
      })
      .catch(err => console.error('Failed to delete agent via API:', err));
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

  if (isLoading) {
    return (
      <div className="flex h-full w-full items-center justify-center text-xs text-ink/40">
        Loading agents from database...
      </div>
    );
  }

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
