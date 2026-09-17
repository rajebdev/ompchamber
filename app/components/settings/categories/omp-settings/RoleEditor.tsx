/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Model role editor — role → model selector overrides in config.yml.
 * Roles come from the native omp schema (`modelRoles` built-in roles), and
 * writes go through /api/model-roles, which edits only `modelRoles` in the
 * global config. Empty input removes the role override.
 */

import { useState } from 'react';
import { Check } from 'lucide-react';

export const MODEL_ROLES = ['default', 'smol', 'slow', 'vision', 'plan', 'commit', 'tiny', 'task', 'advisor'] as const;

interface RoleEditorProps {
  modelRoles: Record<string, string>;
  onSaveRole: (role: string, value: string) => void;
  savedRole: string | null;
}

export function RoleEditor({ modelRoles, onSaveRole, savedRole }: RoleEditorProps) {
  const [roleValues, setRoleValues] = useState<Record<string, string>>(() => ({ ...modelRoles }));

  const commitRole = (role: string, raw: string) => {
    const trimmed = raw.trim();
    if ((modelRoles[role] ?? '') === trimmed) return;
    const next = { ...roleValues };
    if (trimmed) next[role] = trimmed;
    else delete next[role];
    setRoleValues(next);
    onSaveRole(role, trimmed);
  };

  return (
    <div className="pt-2">
      <div className="flex items-center justify-between pb-2">
        <div>
          <h3 className="text-sm font-semibold text-ink">Model Roles</h3>
          <p className="text-ink/50 mt-0.5">Role → model selectors from config.yml. Empty removes the role override.</p>
        </div>
        {savedRole && (
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
              value={roleValues[role] ?? ''}
              onChange={(e) => setRoleValues((prev) => ({ ...prev, [role]: e.target.value }))}
              onBlur={(e) => commitRole(role, e.target.value)}
              placeholder="provider/model"
              className="w-56 bg-paper border border-ink/15 rounded-md px-2 py-1 text-ink text-right font-mono"
            />
          </div>
        ))}
      </div>
    </div>
  );
}
