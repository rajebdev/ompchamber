import React, { useState } from 'react';
import { Info, Copy, Check, RotateCcw, Save, ShieldCheck, Code } from 'lucide-react';
import { DEFAULT_BEHAVIOR_RULES } from '@/data/behaviorData';

interface BehaviorEditorProps {
  content: string;
  onSave: (newContent: string) => void;
  onReset: () => void;
}

export const BehaviorEditor: React.FC<BehaviorEditorProps> = ({
  content,
  onSave,
  onReset,
}) => {
  const [editorValue, setEditorValue] = useState(content);
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);

  const lines = editorValue.split('\n');
  const lineCount = lines.length;
  const charCount = editorValue.length;
  const tokenEstimate = Math.round(charCount / 4);

  const handleCopy = () => {
    navigator.clipboard.writeText(editorValue);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSave = () => {
    onSave(editorValue);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleInsertRule = (ruleSnippet: string) => {
    setEditorValue((prev) => `${prev.trim()}\n\n${ruleSnippet}\n`);
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-paper text-ink p-6 md:p-8 overflow-hidden">
      {/* Header Bar */}
      <div className="flex items-center justify-between pb-4 border-b border-ink/10">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-bold tracking-tight text-ink flex items-center gap-2">
            <span>Global AGENTS.md</span>
          </h2>
          <div className="group relative">
            <Info className="w-4 h-4 text-ink/40 cursor-help" />
            <div className="absolute left-0 top-6 hidden group-hover:block w-72 p-2.5 rounded-lg bg-ink text-paper text-xs shadow-lg z-20 leading-relaxed pointer-events-none">
              Global instructions and protocols governing autonomous agent planning, code exploration, and commit verification across all workspaces.
            </div>
          </div>
        </div>

        {/* Action Buttons Top */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleCopy}
            title="Copy to clipboard"
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-ink/20 hover:border-ink/40 hover:bg-ink/5 text-ink transition-colors cursor-pointer"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-ink" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied ? 'Copied' : 'Copy'}</span>
          </button>
          <button
            type="button"
            onClick={onReset}
            title="Reset to default rules"
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-ink/20 hover:border-ink/40 hover:bg-ink/5 text-ink transition-colors cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset</span>
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-lg bg-ink text-paper hover:bg-ink/90 transition-colors shadow-xs cursor-pointer"
          >
            {saved ? <Check className="w-3.5 h-3.5" /> : <Save className="w-3.5 h-3.5" />}
            <span>{saved ? 'Saved' : 'Save Changes'}</span>
          </button>
        </div>
      </div>

      {/* Quick Insert Snippet Chips */}
      <div className="py-3 flex items-center gap-2 overflow-x-auto text-xs border-b border-ink/10">
        <span className="text-ink/50 uppercase tracking-wider text-[10px] font-bold whitespace-nowrap">
          Quick Insert:
        </span>
        <button
          type="button"
          onClick={() =>
            handleInsertRule(
              `<mandatory_rules>\nALWAY USE CODEGRAPH (codegraph_codegraph_explore) TOOL MCP FIRST BEFORE OTHER TOOL BUILT-IN.\n</mandatory_rules>`
            )
          }
          className="px-2.5 py-1 text-xs font-mono rounded-md bg-ink/5 hover:bg-ink/10 border border-ink/15 whitespace-nowrap transition-colors flex items-center gap-1.5 text-ink cursor-pointer"
        >
          <Code className="w-3.5 h-3.5 text-ink/60" />
          + CodeGraph Rule
        </button>
        <button
          type="button"
          onClick={() =>
            handleInsertRule(
              `<mandatory_rules>\nIF SUBAGENT NOT DEFINE MODELID, DELEGATE TASK USING INHERIT WITH PARENT MODELID.\n</mandatory_rules>`
            )
          }
          className="px-2.5 py-1 text-xs font-mono rounded-md bg-ink/5 hover:bg-ink/10 border border-ink/15 whitespace-nowrap transition-colors flex items-center gap-1.5 text-ink cursor-pointer"
        >
          <ShieldCheck className="w-3.5 h-3.5 text-ink/60" />
          + Model Inheritance
        </button>
        <button
          type="button"
          onClick={() =>
            handleInsertRule(
              `<mandatory_rules>\nWHEN COMMIT, ALWAYS USE CONVENTIONAL COMMIT. JANGAN COMMIT SAMPAI AKU MINTA.\n</mandatory_rules>`
            )
          }
          className="px-2.5 py-1 text-xs font-mono rounded-md bg-ink/5 hover:bg-ink/10 border border-ink/15 whitespace-nowrap transition-colors flex items-center gap-1.5 text-ink cursor-pointer"
        >
          <ShieldCheck className="w-3.5 h-3.5 text-ink/60" />
          + Conventional Commit Guard
        </button>
      </div>

      {/* Code Editor Area with Line Numbers */}
      <div className="flex-1 min-h-0 mt-3 rounded-lg border border-ink/20 hover:border-ink/40 bg-ink/5 overflow-hidden flex flex-col font-mono text-xs focus-within:border-ink transition-colors">
        <div className="flex-1 flex overflow-hidden">
          {/* Line Numbers */}
          <div className="w-10 py-3 pr-2 select-none text-right font-mono text-xs text-ink/30 border-r border-ink/10 bg-ink/[0.02] overflow-hidden leading-relaxed">
            {Array.from({ length: Math.max(lineCount, 12) }).map((_, i) => (
              <div key={i}>{i + 1}</div>
            ))}
          </div>

          {/* Text Area */}
          <textarea
            value={editorValue}
            onChange={(e) => setEditorValue(e.target.value)}
            spellCheck={false}
            className="flex-1 p-3 bg-transparent text-ink font-mono text-xs leading-relaxed resize-none focus:outline-none overflow-y-auto"
            placeholder="Type instructions in <mandatory_rules> tags..."
          />
        </div>

        {/* Editor Status Bar */}
        <div className="p-2.5 border-t border-ink/10 bg-paper flex items-center justify-between text-xs font-mono text-ink/60">
          <div className="flex items-center gap-4">
            <span>{lineCount} lines</span>
            <span>{charCount} chars</span>
            <span>~{tokenEstimate} tokens</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-ink/60" />
            <span>Markdown / Prompt Protocol</span>
          </div>
        </div>
      </div>
    </div>
  );
};
