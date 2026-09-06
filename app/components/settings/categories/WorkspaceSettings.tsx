import React, { useState } from 'react';
import { FolderGit, Server, Radio, GitBranch, Check, Plus, Trash2, Globe, Shield, RefreshCw } from 'lucide-react';
import type { SettingsState, SettingsCategoryId } from '@/types';

interface WorkspaceSettingsProps {
  category: SettingsCategoryId;
  settings: SettingsState;
  onUpdate: (updater: Partial<SettingsState> | ((prev: SettingsState) => SettingsState)) => void;
}

export function WorkspaceSettings({ category, settings, onUpdate }: WorkspaceSettingsProps) {
  const [tunnelStatus, setTunnelStatus] = useState<'connected' | 'disconnected'>('connected');
  const [remoteHosts, setRemoteHosts] = useState([
    { id: '1', name: 'Local Bun Edge Runner', host: '127.0.0.1:3000', status: 'Online' },
    { id: '2', name: 'Cloud Staging Instance', host: 'edge-cluster.internal:8080', status: 'Standby' }
  ]);

  if (category === 'projects') {
    return (
      <div className="space-y-6 text-xs text-[#141310]">
        <div className="space-y-2">
          <h4 className="text-sm font-semibold text-[#141310]">Default Workspace Root</h4>
          <p className="text-[11px] text-[#141310]/60">Where newly scaffolded applications and repositories are placed.</p>
          <div className="flex items-center space-x-2 max-w-md">
            <input
              type="text"
              value={settings.defaultWorkspacePath}
              onChange={(e) => onUpdate({ defaultWorkspacePath: e.target.value })}
              className="flex-1 bg-[#faf8f3] border border-[#141310]/20 rounded-lg px-3 py-2 text-xs font-mono text-[#141310] focus:outline-none focus:border-[#141310]"
            />
          </div>
        </div>

        <div className="border-t border-[#141310]/10" />

        <div className="space-y-3">
          <h4 className="text-sm font-semibold text-[#141310]">Ignored Patterns & Directories</h4>
          <div className="flex flex-wrap gap-1.5 font-mono text-[11px]">
            {['node_modules', '.git', 'dist', '.cache', '.turbo', 'build'].map(item => (
              <span key={item} className="px-2.5 py-1 rounded-md bg-[#141310]/5 border border-[#141310]/15 text-[#141310]">
                {item}
              </span>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (category === 'remote-instances') {
    return (
      <div className="space-y-6 text-xs text-[#141310]">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-sm font-semibold text-[#141310]">Remote Host Runners</h4>
            <p className="text-[11px] text-[#141310]/60">Manage container environments and remote Bun SSH links.</p>
          </div>
          <button
            type="button"
            className="px-3 py-1.5 rounded-lg bg-[#141310] text-[#f4f1ea] text-xs font-semibold flex items-center space-x-1.5 shadow-2xs"
          >
            <Plus size={13} />
            <span>Add Host</span>
          </button>
        </div>

        <div className="space-y-2">
          {remoteHosts.map(host => (
            <div key={host.id} className="p-3 bg-[#faf8f3] border border-[#141310]/15 rounded-xl flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <Server size={16} className="text-[#141310]/60" />
                <div>
                  <div className="font-semibold text-xs text-[#141310]">{host.name}</div>
                  <div className="font-mono text-[10px] text-[#141310]/50">{host.host}</div>
                </div>
              </div>
              <div className="flex items-center space-x-3">
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-800 border border-emerald-500/20">
                  {host.status}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (category === 'external-tunnel') {
    return (
      <div className="space-y-6 text-xs text-[#141310]">
        <div className="flex items-center space-x-2">
          <h4 className="text-sm font-semibold text-[#141310]">External Tunnel Gateway</h4>
          <span className="px-1.5 py-0.2 text-[9px] font-mono font-semibold rounded bg-amber-500/15 text-amber-900 border border-amber-500/20">
            beta
          </span>
        </div>
        <p className="text-[11px] text-[#141310]/60">
          Expose your local development server to an encrypted HTTPS web tunnel for testing on mobile or external devices.
        </p>

        <div className="p-4 rounded-xl border border-[#141310]/15 bg-[#faf8f3] space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2.5">
              <Radio size={16} className={settings.tunnelEnabled ? 'text-emerald-700 animate-pulse' : 'text-[#141310]/40'} />
              <div>
                <span className="font-semibold text-xs text-[#141310]">Tunnel Status</span>
                <div className="font-mono text-[10px] text-[#141310]/60">
                  {settings.tunnelEnabled ? 'https://omp-dev-preview.tunnel.ompchamber.io' : 'Tunnel is inactive'}
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onUpdate({ tunnelEnabled: !settings.tunnelEnabled })}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                settings.tunnelEnabled
                  ? 'bg-red-700 text-white hover:bg-red-800'
                  : 'bg-[#141310] text-[#f4f1ea] hover:bg-[#141310]/90'
              }`}
            >
              {settings.tunnelEnabled ? 'Stop Tunnel' : 'Start Tunnel'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Git Settings
  return (
    <div className="space-y-6 text-xs text-[#141310]">
      <div className="space-y-4">
        <h4 className="text-sm font-semibold text-[#141310]">Git Identity</h4>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-lg">
          <div>
            <label className="block text-[11px] font-medium text-[#141310]/70 mb-1">Author Name</label>
            <input
              type="text"
              value={settings.gitAuthorName}
              onChange={(e) => onUpdate({ gitAuthorName: e.target.value })}
              className="w-full bg-[#faf8f3] border border-[#141310]/20 rounded-lg px-3 py-2 text-xs text-[#141310] focus:outline-none focus:border-[#141310]"
            />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-[#141310]/70 mb-1">Author Email</label>
            <input
              type="email"
              value={settings.gitAuthorEmail}
              onChange={(e) => onUpdate({ gitAuthorEmail: e.target.value })}
              className="w-full bg-[#faf8f3] border border-[#141310]/20 rounded-lg px-3 py-2 text-xs text-[#141310] focus:outline-none focus:border-[#141310]"
            />
          </div>
        </div>
      </div>

      <div className="border-t border-[#141310]/10" />

      <div className="space-y-3">
        <h4 className="text-sm font-semibold text-[#141310]">Auto-Fetch & Sync</h4>
        <label className="flex items-center space-x-2.5 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={settings.gitAutoFetch}
            onChange={(e) => onUpdate({ gitAutoFetch: e.target.checked })}
            className="w-4 h-4 rounded border-[#141310]/30 text-[#141310] focus:ring-0 accent-[#141310]"
          />
          <span className="text-xs text-[#141310]/85">Periodically auto-fetch remote branches (every 2 minutes)</span>
        </label>
      </div>
    </div>
  );
}
