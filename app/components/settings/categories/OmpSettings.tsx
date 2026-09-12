import { useCallback, useEffect, useState } from 'react';
import { RefreshCw, Check } from 'lucide-react';
import type { SettingsState } from '@/types';

interface OmpSettingsProps {
  settings: SettingsState;
  onUpdate: (updater: Partial<SettingsState> | ((prev: SettingsState) => SettingsState)) => void;
}

interface ConfigEntry {
  value?: unknown;
  type: string;
  description: string;
}

interface AgentState {
  model?: { provider?: string; id?: string };
  contextUsage?: { percent?: number } | null;
  fastModeEnabled?: boolean;
  thinkingLevel?: string;
}

interface ExtensionItem {
  id: string;
  name: string;
  sourceRoot: string;
  filePath: string;
  disabled: boolean;
}

/** Curated, editable native omp config keys (label + key). */
const EDITABLE_KEYS: Array<{ key: string; label: string }> = [
  { key: 'textVerbosity', label: 'Text verbosity' },
  { key: 'personality', label: 'Personality' },
  { key: 'defaultThinkingLevel', label: 'Default thinking level' },
  { key: 'externalThinking', label: 'External thinking' },
  { key: 'skillful', label: 'Skillful mode' },
  { key: 'extendedContext', label: 'Extended context' },
  { key: 'readLineNumbers', label: 'Read line numbers' },
  { key: 'compaction.enabled', label: 'Auto compaction' },
  { key: 'compaction.thresholdPercent', label: 'Compaction threshold %' },
  { key: 'retry.enabled', label: 'Auto retry' },
  { key: 'retry.maxRetries', label: 'Retry max attempts' },
];

/** Built-in omp model roles (modelRoles mapping in config.yml). */
const MODEL_ROLES = ['default', 'smol', 'slow', 'vision', 'plan', 'commit', 'tiny', 'task', 'advisor'] as const;

export function OmpSettings({ settings: _settings, onUpdate: _onUpdate }: OmpSettingsProps) {
  const [state, setState] = useState<AgentState | null>(null);
  const [stateRunning, setStateRunning] = useState(false);
  const [entries, setEntries] = useState<Record<string, ConfigEntry>>({});
  const [modelRoles, setModelRoles] = useState<Record<string, string>>({});
  const [extensions, setExtensions] = useState<ExtensionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [savedKey, setSavedKey] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      fetch('/api/omp/state').then((res) => res.json()),
      fetch('/api/settings/omp-config').then((res) => res.json()),
      fetch('/api/model-roles').then((res) => res.json()),
      fetch('/api/omp/extensions').then((res) => res.json()),
    ])
      .then(([stateData, configData, rolesData, extensionsData]) => {
        if (stateData.running && stateData.state) setState(stateData.state as AgentState);
        setStateRunning(Boolean(stateData.running));
        if (configData.entries) setEntries(configData.entries as Record<string, ConfigEntry>);
        if (rolesData.roles && typeof rolesData.roles === 'object') setModelRoles(rolesData.roles as Record<string, string>);
        if (Array.isArray(extensionsData.extensions)) setExtensions(extensionsData.extensions as ExtensionItem[]);
      })
      .catch((err) => console.error('Failed to load omp settings:', err))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSave = (key: string, rawValue: string, type: string) => {
    let value: string | number | boolean = rawValue;
    if (type === 'number') value = Number(rawValue);
    else if (type === 'boolean') value = rawValue === 'true';
    fetch('/api/settings/omp-config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, value }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          setEntries((prev) => ({ ...prev, [key]: { ...prev[key], value } }));
          setSavedKey(key);
          setTimeout(() => setSavedKey((current) => (current === key ? null : current)), 2000);
        }
      })
      .catch((err) => console.error('Failed to save omp config:', err));
  };

  const handleSaveRole = (role: string, value: string) => {
    const next = { ...modelRoles };
    if (value.trim()) next[role] = value.trim();
    else delete next[role];
    setModelRoles(next);
    fetch('/api/model-roles', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roles: next }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          setSavedKey(`role-${role}`);
          setTimeout(() => setSavedKey((current) => (current === `role-${role}` ? null : current)), 2000);
        }
      })
      .catch((err) => console.error('Failed to save model roles:', err));
  };

  const handleToggleExtension = (extension: ExtensionItem) => {
    fetch('/api/omp/extensions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: extension.id, disabled: !extension.disabled }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          setExtensions((prev) => prev.map((item) => (
            item.id === extension.id ? { ...item, disabled: !extension.disabled } : item
          )));
          setSavedKey(`ext-${extension.id}`);
          setTimeout(() => setSavedKey((current) => (current === `ext-${extension.id}` ? null : current)), 2000);
        }
      })
      .catch((err) => console.error('Failed to toggle extension:', err));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8 text-ink/40 text-xs">
        Loading OMP settings...
      </div>
    );
  }

  return (
    <div className="w-full space-y-4 text-ink pb-2 text-xs">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-ink/10">
        <div>
          <h2 className="text-sm font-semibold text-ink">OMP Engine</h2>
          <p className="text-ink/50 mt-0.5">Live agent state and native config keys.</p>
        </div>
        <button
          type="button"
          onClick={load}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-ink/15 text-ink/70 hover:text-ink hover:bg-ink/5 transition-all"
        >
          <RefreshCw size={12} /> Refresh
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <div className="rounded-lg border border-ink/10 bg-ink/[0.03] px-3 py-2">
          <div className="text-[10px] uppercase tracking-wide text-ink/40">Engine</div>
          <div className="font-semibold text-ink mt-0.5">{stateRunning ? 'Running' : 'Idle'}</div>
        </div>
        <div className="rounded-lg border border-ink/10 bg-ink/[0.03] px-3 py-2">
          <div className="text-[10px] uppercase tracking-wide text-ink/40">Model</div>
          <div className="font-semibold text-ink mt-0.5 truncate">{state?.model?.id ?? '—'}</div>
        </div>
        <div className="rounded-lg border border-ink/10 bg-ink/[0.03] px-3 py-2">
          <div className="text-[10px] uppercase tracking-wide text-ink/40">Thinking</div>
          <div className="font-semibold text-ink mt-0.5">{state?.thinkingLevel ?? '—'}</div>
        </div>
        <div className="rounded-lg border border-ink/10 bg-ink/[0.03] px-3 py-2">
          <div className="text-[10px] uppercase tracking-wide text-ink/40">Context</div>
          <div className="font-semibold text-ink mt-0.5">
            {state?.contextUsage?.percent != null ? `${state.contextUsage.percent.toFixed(1)}%` : '—'}
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-ink/10 divide-y divide-ink/5">
        {EDITABLE_KEYS.map(({ key, label }) => {
          const entry = entries[key];
          const value = entry?.value;
          const isBoolean = entry?.type === 'boolean';
          return (
            <div key={key} className="flex items-center justify-between gap-3 px-3 py-2.5">
              <div className="min-w-0">
                <div className="font-medium text-ink">{label}</div>
                {entry?.description && <div className="text-[10px] text-ink/40 truncate">{entry.description}</div>}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {isBoolean ? (
                  <select
                    aria-label={label}
                    defaultValue={value === true ? 'true' : 'false'}
                    onChange={(e) => handleSave(key, e.target.value, 'boolean')}
                    className="bg-paper border border-ink/15 rounded-md px-2 py-1 text-ink"
                  >
                    <option value="true">true</option>
                    <option value="false">false</option>
                  </select>
                ) : (
                  <input
                    aria-label={label}
                    type="text"
                    defaultValue={value == null ? '' : String(value)}
                    onBlur={(e) => {
                      if (String(value ?? '') !== e.target.value) handleSave(key, e.target.value, entry?.type ?? 'string');
                    }}
                    className="w-32 bg-paper border border-ink/15 rounded-md px-2 py-1 text-ink text-right"
                  />
                )}
                {savedKey === key && <Check size={12} className="text-ink" />}
              </div>
            </div>
          );
        })}
      </div>

      <div className="pt-2">
        <div className="flex items-center justify-between pb-2">
          <div>
            <h3 className="text-sm font-semibold text-ink">Model Roles</h3>
            <p className="text-ink/50 mt-0.5">Role → model selectors from config.yml. Empty removes the role override.</p>
          </div>
          {savedKey?.startsWith('role-') && (
            <span className="inline-flex items-center gap-1 text-[10px] text-ink/60"><Check size={11} /> saved</span>
          )}
        </div>
        <div className="rounded-lg border border-ink/10 divide-y divide-ink/5">
          {MODEL_ROLES.map((role) => (
            <div key={role} className="flex items-center justify-between gap-3 px-3 py-2.5">
              <div className="font-medium text-ink capitalize">{role}</div>
              <input
                aria-label={`${role} model`}
                type="text"
                defaultValue={modelRoles[role] ?? ''}
                placeholder="provider/model"
                onBlur={(e) => {
                  if ((modelRoles[role] ?? '') !== e.target.value.trim()) handleSaveRole(role, e.target.value);
                }}
                className="w-56 bg-paper border border-ink/15 rounded-md px-2 py-1 text-ink text-right font-mono"
              />
            </div>
          ))}
        </div>
      </div>

      {extensions.length > 0 && (
        <div className="pt-2">
          <div className="flex items-center justify-between pb-2">
            <div>
              <h3 className="text-sm font-semibold text-ink">Extensions</h3>
              <p className="text-ink/50 mt-0.5">TS/JS modules loaded from .omp/extensions. Disable writes to config.yml.</p>
            </div>
            {savedKey?.startsWith('ext-') && (
              <span className="inline-flex items-center gap-1 text-[10px] text-ink/60"><Check size={11} /> saved</span>
            )}
          </div>
          <div className="rounded-lg border border-ink/10 divide-y divide-ink/5">
            {extensions.map((extension) => (
              <div key={extension.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                <div className="min-w-0">
                  <div className="font-medium text-ink">{extension.name}</div>
                  <div className="text-[10px] text-ink/40 truncate font-mono">{extension.sourceRoot} · {extension.filePath}</div>
                </div>
                <select
                  aria-label={`${extension.name} enabled`}
                  value={extension.disabled ? 'false' : 'true'}
                  onChange={() => handleToggleExtension(extension)}
                  className="bg-paper border border-ink/15 rounded-md px-2 py-1 text-ink"
                >
                  <option value="true">enabled</option>
                  <option value="false">disabled</option>
                </select>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
