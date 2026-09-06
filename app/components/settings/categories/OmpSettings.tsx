import React, { useState } from 'react';
import { Cloud, Bot, Sliders, Terminal, Boxes, Key, Plus, Check, Trash2, Cpu } from 'lucide-react';
import type { SettingsState, SettingsCategoryId } from '@/types';

interface OmpSettingsProps {
  category: SettingsCategoryId;
  settings: SettingsState;
  onUpdate: (updater: Partial<SettingsState> | ((prev: SettingsState) => SettingsState)) => void;
}

export function OmpSettings({ category, settings, onUpdate }: OmpSettingsProps) {
  const [providers, setProviders] = useState([
    { id: 'claude', name: 'Anthropic Claude 3.7 Sonnet', status: 'Connected', keyConfigured: true },
    { id: 'deepseek', name: 'DeepSeek V3 / R1 (Reasoning)', status: 'Connected', keyConfigured: true },
    { id: 'gemini', name: 'Google Gemini 2.5 Flash', status: 'Active (Built-in)', keyConfigured: true },
    { id: 'openai', name: 'OpenAI GPT-4o', status: 'Ready', keyConfigured: false },
    { id: 'ollama', name: 'Local Ollama Runner (127.0.0.1:11434)', status: 'Standby', keyConfigured: false }
  ]);

  const [commands, setCommands] = useState([
    { trigger: '/test', description: 'Run test suites with bun test' },
    { trigger: '/build', description: 'Trigger bun build with source bundling' },
    { trigger: '/deploy', description: 'Deploy current stage to Cloud Run' },
    { trigger: '/doctor', description: 'Inspect workspace health and dependencies' }
  ]);

  const [mcpServers, setMcpServers] = useState([
    { name: 'bun-runtime-mcp', command: 'bun x @omp/mcp-bun', status: 'Running' },
    { name: 'git-automation-mcp', command: 'node scripts/mcp-git.js', status: 'Running' }
  ]);

  if (category === 'providers') {
    return (
      <div className="space-y-6 text-xs text-[#141310]">
        <div className="space-y-2">
          <h4 className="text-sm font-semibold text-[#141310]">AI Model Providers & Engines</h4>
          <p className="text-[11px] text-[#141310]/60">Select active provider engine for Oh-My-Pi agent autonomous chamber.</p>
        </div>

        <div className="space-y-2.5">
          {providers.map(p => {
            const isActive = settings.activeProvider === p.id;
            return (
              <div
                key={p.id}
                onClick={() => onUpdate({ activeProvider: p.id })}
                className={`p-3 rounded-xl border cursor-pointer transition-all flex items-center justify-between ${
                  isActive
                    ? 'border-[#141310] bg-[#141310]/5 ring-1 ring-[#141310]'
                    : 'border-[#141310]/15 bg-[#faf8f3] hover:border-[#141310]/30'
                }`}
              >
                <div className="flex items-center space-x-3">
                  <Cloud size={16} className={isActive ? 'text-[#141310]' : 'text-[#141310]/50'} />
                  <div>
                    <div className="font-semibold text-xs text-[#141310]">{p.name}</div>
                    <div className="text-[10px] text-[#141310]/60">{p.status}</div>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  {p.keyConfigured ? (
                    <span className="text-[10px] font-mono text-emerald-800 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                      Key Configured
                    </span>
                  ) : (
                    <span className="text-[10px] font-mono text-[#141310]/50 bg-[#141310]/5 px-2 py-0.5 rounded">
                      Needs Key
                    </span>
                  )}
                  {isActive && <Check size={14} className="text-[#141310]" />}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  if (category === 'agents') {
    return (
      <div className="space-y-6 text-xs text-[#141310]">
        <div className="space-y-3">
          <h4 className="text-sm font-semibold text-[#141310]">Oh-My-Pi Autonomous Mode</h4>
          <label className="flex items-start space-x-3 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={settings.autoPatchErrors}
              onChange={(e) => onUpdate({ autoPatchErrors: e.target.checked })}
              className="mt-0.5 w-4 h-4 rounded border-[#141310]/30 text-[#141310] focus:ring-0 accent-[#141310]"
            />
            <div>
              <div className="font-semibold text-xs text-[#141310]">Auto-patch build and lint failures</div>
              <div className="text-[11px] text-[#141310]/60">Automatically inspect exit 1 bun runners and propose immediate remediation patches.</div>
            </div>
          </label>
        </div>

        <div className="border-t border-[#141310]/10" />

        <div className="space-y-3">
          <h4 className="text-sm font-semibold text-[#141310]">Autonomous Action Limits</h4>
          <div className="flex items-center space-x-3">
            <span className="text-xs text-[#141310]/80">Maximum sequential tool steps:</span>
            <select className="bg-[#faf8f3] border border-[#141310]/20 rounded-lg px-2.5 py-1 text-xs">
              <option value="10">10 steps</option>
              <option value="25">25 steps (Standard)</option>
              <option value="50">50 steps (Deep)</option>
            </select>
          </div>
        </div>
      </div>
    );
  }

  if (category === 'behavior') {
    return (
      <div className="space-y-6 text-xs text-[#141310]">
        <div className="space-y-4">
          <h4 className="text-sm font-semibold text-[#141310]">Command Execution Approvals</h4>
          
          <label className="flex items-start space-x-3 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={settings.autoApproveSafeCmds}
              onChange={(e) => onUpdate({ autoApproveSafeCmds: e.target.checked })}
              className="mt-0.5 w-4 h-4 rounded border-[#141310]/30 text-[#141310] focus:ring-0 accent-[#141310]"
            />
            <div>
              <div className="font-semibold text-xs text-[#141310]">Auto-execute safe non-destructive terminal commands</div>
              <div className="text-[11px] text-[#141310]/60">Commands like `ls`, `git status`, `bun --version` run without confirmation prompt.</div>
            </div>
          </label>
        </div>
      </div>
    );
  }

  if (category === 'commands') {
    return (
      <div className="space-y-6 text-xs text-[#141310]">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-sm font-semibold text-[#141310]">Slash Commands</h4>
            <p className="text-[11px] text-[#141310]/60">Quick command shortcuts for chat input.</p>
          </div>
          <button type="button" className="px-3 py-1.5 rounded-lg bg-[#141310] text-[#f4f1ea] text-xs font-semibold flex items-center space-x-1.5 shadow-2xs">
            <Plus size={13} />
            <span>Add Command</span>
          </button>
        </div>

        <div className="space-y-2">
          {commands.map(cmd => (
            <div key={cmd.trigger} className="p-3 bg-[#faf8f3] border border-[#141310]/15 rounded-xl flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <span className="font-mono font-bold text-xs bg-[#141310]/5 px-2 py-1 rounded text-[#141310]">{cmd.trigger}</span>
                <span className="text-xs text-[#141310]/80">{cmd.description}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // MCP Category
  return (
    <div className="space-y-6 text-xs text-[#141310]">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-sm font-semibold text-[#141310]">Model Context Protocol (MCP)</h4>
          <p className="text-[11px] text-[#141310]/60">Connect external tool servers conforming to Anthropic MCP specifications.</p>
        </div>
        <button type="button" className="px-3 py-1.5 rounded-lg bg-[#141310] text-[#f4f1ea] text-xs font-semibold flex items-center space-x-1.5 shadow-2xs">
          <Plus size={13} />
          <span>Add MCP Server</span>
        </button>
      </div>

      <div className="space-y-2">
        {mcpServers.map(s => (
          <div key={s.name} className="p-3 bg-[#faf8f3] border border-[#141310]/15 rounded-xl flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <Boxes size={16} className="text-[#141310]/60" />
              <div>
                <div className="font-semibold text-xs text-[#141310]">{s.name}</div>
                <div className="font-mono text-[10px] text-[#141310]/50">{s.command}</div>
              </div>
            </div>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-800 border border-emerald-500/20">
              {s.status}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
