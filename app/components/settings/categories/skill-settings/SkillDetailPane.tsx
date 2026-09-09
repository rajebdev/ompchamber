import { useState, useEffect } from 'react';
import { Info, Eye, EyeOff, Save, Trash2, Check, User, Sparkles } from 'lucide-react';
import type { SkillItem } from '@/types';

interface SkillDetailPaneProps {
  skill: SkillItem | null;
  isCreatingNew: boolean;
  onSave: (skillData: Partial<SkillItem>) => void;
  onDelete?: (id: string) => void;
  onOpenCatalog?: () => void;
}

export function SkillDetailPane({
  skill,
  isCreatingNew,
  onSave,
  onDelete,
  onOpenCatalog,
}: SkillDetailPaneProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState<'user' | 'project'>('user');
  const [locationLabel, setLocationLabel] = useState('User / OpenCode');
  const [instructions, setInstructions] = useState('');
  const [savedToast, setSavedToast] = useState(false);
  const [showLineNumbers, setShowLineNumbers] = useState(true);

  useEffect(() => {
    if (isCreatingNew || !skill) {
      setName('new-skill');
      setDescription('');
      setLocation('user');
      setLocationLabel('User / OpenCode');
      setInstructions(`---
description: ""
---
`);
    } else {
      setName(skill.name);
      setDescription(skill.description);
      setLocation(skill.location);
      setLocationLabel(skill.locationLabel || 'User / OpenCode');
      setInstructions(skill.instructions);
    }
  }, [skill, isCreatingNew]);

  const handleSave = () => {
    onSave({
      name: name.trim() || 'unnamed-skill',
      description: description.trim(),
      location,
      locationLabel,
      instructions,
    });
    setSavedToast(true);
    setTimeout(() => setSavedToast(false), 2000);
  };

  const lines = instructions.split('\n');
  const lineCount = Math.max(lines.length, 6);

  return (
    <div className="flex-1 flex flex-col h-full scrollbar-overlay-container scrollbar-overlay-static bg-paper text-ink p-6 md:p-8 space-y-6">
      {/* Pane Header */}
      <div className="flex items-start justify-between pb-4 border-b border-ink/10 gap-4">
        <div>
          <h2 className="text-sm font-bold tracking-tight text-ink">
            {isCreatingNew ? 'New Skill' : name}
          </h2>
          <p className="text-xs text-ink/60 mt-0.5">
            {isCreatingNew ? 'Configure a new skill' : 'Configure skill details and prompt rules'}
          </p>
        </div>

        {onOpenCatalog && (
          <button
            type="button"
            onClick={onOpenCatalog}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-ink/20 hover:border-ink/40 text-xs font-medium text-ink hover:bg-ink/5 transition-colors cursor-pointer"
          >
            <Sparkles size={14} className="text-ink/70" />
            <span>Browse Catalog</span>
          </button>
        )}
      </div>

      {/* Basic Information Section */}
      <div className="space-y-4">
        <h3 className="text-xs font-bold uppercase tracking-wider text-ink">
          Basic Information
        </h3>

        {/* Skill Name & Location */}
        <div>
          <div className="flex items-center gap-1.5 mb-1.5">
            <label className="text-xs font-semibold text-ink/80">
              Skill Name & Location
            </label>
            <div className="group relative">
              <Info size={13} className="text-ink/40 cursor-help" />
              <div className="absolute left-0 top-5 hidden group-hover:block w-64 p-2 rounded-lg bg-ink text-paper text-[11px] shadow-lg z-20 pointer-events-none leading-relaxed">
                Unique identifier and runtime execution scope for this skill.
              </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="skill-name"
              className="flex-1 px-3 py-2 rounded-lg border border-ink/20 hover:border-ink/40 bg-paper focus:outline-none focus:border-ink text-xs font-mono text-ink transition-colors"
            />
            <div className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-ink/20 bg-ink/5 text-xs text-ink/80 flex-shrink-0">
              <User size={14} className="text-ink/60" />
              <span>{locationLabel}</span>
            </div>
          </div>
        </div>

        {/* Description */}
        <div>
          <div className="flex items-center gap-1.5 mb-1.5">
            <label className="text-xs font-semibold text-ink/80">
              Description <span className="text-error">*</span>
            </label>
            <div className="group relative">
              <Info size={13} className="text-ink/40 cursor-help" />
              <div className="absolute left-0 top-5 hidden group-hover:block w-64 p-2 rounded-lg bg-ink text-paper text-[11px] shadow-lg z-20 pointer-events-none leading-relaxed">
                Short description helping autonomous agents decide when to invoke this skill.
              </div>
            </div>
          </div>

          <textarea
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Brief description of what this skill does..."
            className="w-full px-3 py-2 rounded-lg border border-ink/20 hover:border-ink/40 bg-paper focus:outline-none focus:border-ink text-xs text-ink transition-colors resize-none leading-relaxed"
          />
        </div>
      </div>

      {/* Instructions Section */}
      <div className="space-y-2 pt-2 border-t border-ink/10">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold uppercase tracking-wider text-ink">
            Instructions
          </h3>
          <button
            type="button"
            onClick={() => setShowLineNumbers(!showLineNumbers)}
            title={showLineNumbers ? 'Hide Line Numbers' : 'Show Line Numbers'}
            className="p-1 rounded-md text-ink/50 hover:text-ink hover:bg-ink/5 transition-colors cursor-pointer"
          >
            {showLineNumbers ? <Eye size={15} /> : <EyeOff size={15} />}
          </button>
        </div>

        {/* Code Editor */}
        <div className="rounded-lg border border-ink/20 hover:border-ink/40 bg-ink/5 overflow-hidden flex flex-col font-mono text-xs focus-within:border-ink transition-colors">
          <div className="flex">
            {showLineNumbers && (
              <div className="w-10 py-3 pr-2 select-none text-right font-mono text-xs text-ink/30 border-r border-ink/10 bg-ink/[0.02] overflow-hidden leading-relaxed">
                {Array.from({ length: lineCount }).map((_, i) => (
                  <div key={i}>{i + 1}</div>
                ))}
              </div>
            )}
            <textarea
              rows={Math.max(lineCount, 8)}
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              spellCheck={false}
              className="flex-1 p-3 bg-transparent text-ink font-mono text-xs leading-relaxed resize-none focus:outline-none overflow-y-auto"
              placeholder="Type markdown instructions..."
            />
          </div>
        </div>
      </div>

      {/* Footer Actions */}
      <div className="pt-4 border-t border-ink/10 flex items-center justify-between">
        {!isCreatingNew && skill && onDelete ? (
          <button
            type="button"
            onClick={() => onDelete(skill.id)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-ink/20 hover:border-error hover:text-error text-ink/70 text-xs font-medium transition-colors cursor-pointer"
          >
            <Trash2 size={14} />
            <span>Delete Skill</span>
          </button>
        ) : (
          <div />
        )}

        <button
          type="button"
          onClick={handleSave}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-ink text-paper text-xs font-medium hover:bg-ink/90 transition-colors shadow-xs cursor-pointer"
        >
          {savedToast ? <Check size={14} /> : <Save size={14} />}
          <span>{savedToast ? 'Saved' : isCreatingNew ? 'Create Skill' : 'Save Changes'}</span>
        </button>
      </div>
    </div>
  );
}
