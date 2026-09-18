import { useEffect, useState } from 'preact/hooks';
import type { FormEvent, FunctionComponent } from 'preact/compat';
import { Bot, Check, Copy, PenTool, Trash2 } from 'lucide-preact';
import type { AgentItem, CommandItem, CommandScope } from '@/shared/types';

interface CommandDetailPaneProps {
  command: CommandItem;
  isNew?: boolean;
  onSave: (updatedCommand: CommandItem) => void;
  onDelete?: (commandId: string) => void;
}

const AVAILABLE_MODELS = [
  'Not selected',
  'claude-3-7-sonnet-20250219',
  'claude-3-5-sonnet-20241022',
  'claude-3-5-haiku-20241022',
  'gpt-4o',
  'gpt-4o-mini',
  'gemini-2.5-pro-preview-03-25',
  'deepseek-chat-v3',
];

export const CommandDetailPane: FunctionComponent<CommandDetailPaneProps> = ({
  command,
  isNew = false,
  onSave,
  onDelete,
}) => {
  const [formData, setFormData] = useState<CommandItem>(command);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [copiedTemplate, setCopiedTemplate] = useState(false);
  const [availableAgents, setAvailableAgents] = useState<AgentItem[]>([]);

  useEffect(() => {
    fetch('/api/settings/agents')
      .then(res => res.json())
      .then(data => {
        if (data?.agents) setAvailableAgents(data.agents);
      })
      .catch(console.error);
  }, []);

  useEffect(() => {
    setFormData(command);
    setSavedSuccess(false);
  }, [command]);

  const handleSave = (e: FormEvent) => {
    e.preventDefault();
    onSave(formData);
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2000);
  };

  const handleCopyTemplate = () => {
    navigator.clipboard.writeText(formData.template);
    setCopiedTemplate(true);
    setTimeout(() => setCopiedTemplate(false), 1800);
  };

  const handleInsertPlaceholder = (text: string) => {
    setFormData((prev) => ({
      ...prev,
      template: prev.template ? `${prev.template} ${text}` : text,
    }));
  };

  return (
    <form onSubmit={handleSave} className="flex-1 flex flex-col h-full scrollbar-overlay-container scrollbar-overlay-static bg-paper text-ink p-6 md:p-8 space-y-6">
      {/* SECTION 1: Identity */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-bold uppercase tracking-wider text-ink">
            Identity
          </h2>
          {formData.isBuiltIn && (
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-ink/5 border border-ink/10 text-ink/60">
              Built-in System Command
            </span>
          )}
        </div>

        <div className="flex items-center gap-3">
          <div className="flex-1">
            <label className="block text-xs font-semibold text-ink/80 mb-1.5">
              Command Name
            </label>
            <div className="flex items-center border border-ink/20 hover:border-ink/40 focus-within:border-ink rounded-lg bg-paper transition-colors">
              <span className="px-3 py-2 font-mono text-xs text-ink/40 border-r border-ink/15 select-none">
                /
              </span>
              <input
                type="text"
                value={formData.name}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    name: e.currentTarget.value.replace(/^\/+/, ''),
                  })
                }
                required
                placeholder="command-name"
                disabled={formData.isBuiltIn}
                className="w-full text-xs font-mono px-3 py-2 bg-transparent focus:outline-none disabled:opacity-60 text-ink"
              />
            </div>
          </div>

          <div className="w-40">
            <label className="block text-xs font-semibold text-ink/80 mb-1.5">
              Scope
            </label>
            <select
              value={formData.scope}
              onChange={(e) =>
                setFormData({ ...formData, scope: e.currentTarget.value as CommandScope })
              }
              disabled={formData.isBuiltIn}
              className="w-full text-xs py-2 px-3 rounded-lg border border-ink/20 hover:border-ink/40 bg-paper focus:outline-none focus:border-ink disabled:opacity-60 text-ink transition-colors cursor-pointer"
            >
              <option value="user">user</option>
              <option value="project">project</option>
              <option value="system">system</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-ink/80 mb-1.5">
            Description
          </label>
          <textarea
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.currentTarget.value })}
            placeholder="What does this command do?"
            rows={2}
            className="w-full text-xs p-3 rounded-lg border border-ink/20 hover:border-ink/40 bg-paper focus:outline-none focus:border-ink placeholder:text-ink/30 text-ink transition-colors"
          />
        </div>
      </div>

      <div className="border-t border-ink/10" />

      {/* SECTION 2: Execution Context */}
      <div className="space-y-3">
        <h2 className="text-xs font-bold uppercase tracking-wider text-ink">
          Execution Context
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Override Agent */}
          <div>
            <label className="block text-xs font-semibold text-ink/80 mb-1.5">
              Override Agent
            </label>
            <div className="flex items-center border border-ink/20 hover:border-ink/40 focus-within:border-ink rounded-lg bg-paper transition-colors">
              <span className="px-2.5 text-ink/40">
                <Bot className="w-3.5 h-3.5" />
              </span>
              <select
                value={formData.overrideAgent || 'Not selected'}
                onChange={(e) => setFormData({ ...formData, overrideAgent: e.currentTarget.value })}
                className="w-full text-xs py-2 pr-3 bg-transparent focus:outline-none cursor-pointer text-ink"
              >
                <option value="Not selected">Not selected</option>
                {availableAgents.map((agent) => (
                  <option key={agent.id} value={agent.name}>
                    @{agent.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Override Model */}
          <div>
            <label className="block text-xs font-semibold text-ink/80 mb-1.5">
              Override Model
            </label>
            <div className="flex items-center border border-ink/20 hover:border-ink/40 focus-within:border-ink rounded-lg bg-paper transition-colors">
              <span className="px-2.5 text-ink/40">
                <PenTool className="w-3.5 h-3.5" />
              </span>
              <select
                value={formData.overrideModel || 'Not selected'}
                onChange={(e) => setFormData({ ...formData, overrideModel: e.currentTarget.value })}
                className="w-full text-xs font-mono py-2 pr-3 bg-transparent focus:outline-none cursor-pointer text-ink"
              >
                {AVAILABLE_MODELS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>

      <div className="border-t border-ink/10" />

      {/* SECTION 3: Command Template */}
      <div className="space-y-2 flex-1 flex flex-col">
        <div className="flex items-center justify-between">
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-ink">
              Command Template
            </label>
            <p className="text-[11px] text-ink/60 mt-0.5">
              Use <code className="text-ink font-semibold font-mono">$ARGUMENTS</code>, <code className="text-ink font-semibold font-mono">!`shell`</code>, or <code className="text-ink font-semibold font-mono">@filename</code>.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCopyTemplate}
              className="flex items-center gap-1.5 text-xs text-ink/60 hover:text-ink transition-colors cursor-pointer"
            >
              {copiedTemplate ? <Check className="w-3.5 h-3.5 text-ink" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedTemplate ? 'Copied' : 'Copy'}</span>
            </button>
          </div>
        </div>

        {/* Quick Insert Helper Buttons */}
        <div className="flex items-center gap-2 py-1">
          <button
            type="button"
            onClick={() => handleInsertPlaceholder('$ARGUMENTS')}
            className="px-2.5 py-1 text-xs font-mono rounded-md bg-ink/5 hover:bg-ink/10 border border-ink/15 text-ink transition-colors cursor-pointer"
          >
            +$ARGUMENTS
          </button>
          <button
            type="button"
            onClick={() => handleInsertPlaceholder('!`bun test`')}
            className="px-2.5 py-1 text-xs font-mono rounded-md bg-ink/5 hover:bg-ink/10 border border-ink/15 text-ink transition-colors cursor-pointer"
          >
            +!shell
          </button>
          <button
            type="button"
            onClick={() => handleInsertPlaceholder('@src/App.tsx')}
            className="px-2.5 py-1 text-xs font-mono rounded-md bg-ink/5 hover:bg-ink/10 border border-ink/15 text-ink transition-colors cursor-pointer"
          >
            +@filename
          </button>
        </div>

        <textarea
          value={formData.template}
          onChange={(e) => setFormData({ ...formData, template: e.currentTarget.value })}
          rows={7}
          placeholder="Enter command template instructions..."
          className="w-full flex-1 min-h-[140px] text-xs font-mono p-3 rounded-lg border border-ink/20 hover:border-ink/40 bg-ink/5 focus:outline-none focus:border-ink leading-relaxed transition-colors"
        />
      </div>

      {/* Footer Controls */}
      <div className="pt-3 border-t border-ink/10 flex items-center justify-between">
        <div>
          {!formData.isBuiltIn && !isNew && onDelete && (
            <button
              type="button"
              onClick={() => onDelete(formData.id)}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-ink/20 hover:border-error hover:text-error text-ink/70 text-xs font-medium transition-colors cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Delete Command
            </button>
          )}
        </div>

        <div className="flex items-center gap-3">
          {savedSuccess && (
            <span className="flex items-center gap-1 text-xs text-ink font-medium">
              <Check className="w-3.5 h-3.5" />
              Saved successfully
            </span>
          )}
          <button
            type="submit"
            className="px-4 py-2 rounded-lg bg-ink text-paper text-xs font-medium hover:bg-ink/90 transition-colors shadow-xs cursor-pointer"
          >
            {isNew ? 'Create Command' : 'Save Command'}
          </button>
        </div>
      </div>
    </form>
  );
};
