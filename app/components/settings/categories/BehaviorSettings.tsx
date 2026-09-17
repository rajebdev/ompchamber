import React, { useState } from 'react';
import type { InstructionFileKind } from '@/types';
import { BehaviorEditor } from '@/components/settings/categories/behavior-settings/Editor';
import { useInstructionFile } from '@/hooks/settings/instruction-file';

/** The two native user instruction files, in the order omp loads them. */
const TABS: Array<{ kind: InstructionFileKind; label: string; hint: string }> = [
  { kind: 'agents', label: 'AGENTS.md', hint: 'context file' },
  { kind: 'rules', label: 'RULES.md', hint: 'sticky rule' },
];

/**
 * Behavior rules live in omp's native user instruction files, and this panel
 * reads and writes them directly: AGENTS.md (context file, loaded when a
 * session starts) and RULES.md (sticky rule, re-sent on every request).
 * MOCK=true keeps the demo on chamber-local preset rows instead of the real
 * agent directory.
 */
export const BehaviorSettings: React.FC = () => {
  const [activeKind, setActiveKind] = useState<InstructionFileKind>('agents');
  const agents = useInstructionFile('agents');
  const rules = useInstructionFile('rules');
  const active = activeKind === 'agents' ? agents : rules;
  const activeTab = TABS.find((tab) => tab.kind === activeKind) ?? TABS[0];

  return (
    <div className="h-full w-full overflow-hidden flex flex-col bg-paper">
      {/* File Tabs */}
      <div className="flex items-center gap-1.5 px-6 md:px-8 pt-5">
        {TABS.map((tab) => (
          <button
            key={tab.kind}
            type="button"
            onClick={() => setActiveKind(tab.kind)}
            className={`px-3 py-1.5 text-xs font-mono rounded-lg border transition-colors cursor-pointer ${
              tab.kind === activeKind
                ? 'border-ink bg-ink text-paper'
                : 'border-ink/20 text-ink/60 hover:border-ink/40 hover:bg-ink/5'
            }`}
          >
            {tab.label}
            <span className="ml-2 opacity-60">{tab.hint}</span>
          </button>
        ))}
      </div>

      {active.error && (
        <div className="mx-6 md:mx-8 mt-3 px-3 py-2 text-xs font-mono text-error bg-error/5 border border-error/30 rounded-lg">
          Failed to load {active.filePath ?? activeTab.label}: {active.error}
        </div>
      )}

      {active.isLoading ? (
        <div className="flex-1 flex items-center justify-center text-xs text-ink/40">
          Loading {activeTab.label} from {active.filePath ?? 'the preset store'}...
        </div>
      ) : (
        <BehaviorEditor
          key={activeKind}
          kind={activeKind}
          content={active.content}
          filePath={active.filePath}
          exists={active.exists}
          isMock={active.isMock}
          onSave={active.save}
          onReset={activeKind === 'agents' ? active.reset : undefined}
        />
      )}
    </div>
  );
};
