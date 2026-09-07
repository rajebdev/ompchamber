import React, { useState, useEffect } from 'react';
import {
  Search,
  Star,
  RefreshCw,
  GitBranch,
  ExternalLink,
  Check,
  Plus,
  Download,
  Trash2,
} from 'lucide-react';
import type { SkillCatalogSource, CatalogSkillItem, SkillItem } from '@/types';
import { DEFAULT_CATALOG_SOURCES, DEFAULT_CATALOG_SKILLS, DEFAULT_SKILLS } from '@/data/skillData';
import { AddSourceModal } from './skill-catalog/AddSourceModal';

interface SkillCatalogSettingsProps {
  onNavigateToSkills?: () => void;
}

export function SkillCatalogSettings({ onNavigateToSkills }: SkillCatalogSettingsProps) {
  const [sources, setSources] = useState<SkillCatalogSource[]>(DEFAULT_CATALOG_SOURCES);
  const [selectedSourceId, setSelectedSourceId] = useState<string>('anthropic');
  const [searchQuery, setSearchQuery] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isAddSourceModalOpen, setIsAddSourceModalOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Installed skills state from localStorage
  const [installedSkillIds, setInstalledSkillIds] = useState<Set<string>>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('omp_skills');
        if (saved) {
          const parsed: SkillItem[] = JSON.parse(saved);
          return new Set(parsed.map((s) => s.name));
        }
      } catch (e) {
        // fallback
      }
    }
    return new Set(DEFAULT_SKILLS.map((s) => s.name));
  });

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 2500);
  };

  const handleRefresh = () => {
    setIsRefreshing(true);
    setTimeout(() => {
      setIsRefreshing(false);
      showToast('Catalog index synchronized');
    }, 600);
  };

  const handleInstallToggle = (skill: CatalogSkillItem) => {
    const isInstalled = installedSkillIds.has(skill.name);

    let currentSkills: SkillItem[] = [];
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('omp_skills');
        currentSkills = saved ? JSON.parse(saved) : DEFAULT_SKILLS;
      } catch (e) {
        currentSkills = DEFAULT_SKILLS;
      }
    }

    if (isInstalled) {
      // Uninstall
      const updated = currentSkills.filter((s) => s.name !== skill.name);
      if (typeof window !== 'undefined') {
        localStorage.setItem('omp_skills', JSON.stringify(updated));
      }
      setInstalledSkillIds((prev) => {
        const next = new Set(prev);
        next.delete(skill.name);
        return next;
      });
      showToast(`Uninstalled skill "${skill.name}"`);
    } else {
      // Install
      const newSkill: SkillItem = {
        id: `skill-cat-${Date.now()}`,
        name: skill.name,
        description: skill.description,
        location: 'user',
        locationLabel: 'User / OpenCode',
        instructions: skill.instructions || `---\ndescription: "${skill.description}"\n---\n\n## Instructions\nFollow standard prompt protocol for ${skill.name}.`,
        project: 'ompchamber',
        isInstalledFromCatalog: true,
        catalogSource: skill.sourceId,
      };
      const updated = [...currentSkills, newSkill];
      if (typeof window !== 'undefined') {
        localStorage.setItem('omp_skills', JSON.stringify(updated));
      }
      setInstalledSkillIds((prev) => new Set(prev).add(skill.name));
      showToast(`Installed skill "${skill.name}"`);
    }
  };

  const handleAddSource = (newSource: SkillCatalogSource) => {
    setSources((prev) => [...prev, newSource]);
    setSelectedSourceId(newSource.id);
    showToast(`Added source "${newSource.name}"`);
  };

  // Filter skills by selected source or search query
  const filteredSkills = DEFAULT_CATALOG_SKILLS.filter((item) => {
    const matchesSearch =
      !searchQuery.trim() ||
      item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.repoTag.toLowerCase().includes(searchQuery.toLowerCase());

    if (searchQuery.trim()) {
      return matchesSearch;
    }

    return item.sourceId === selectedSourceId;
  });

  const activeSource = sources.find((s) => s.id === selectedSourceId) || sources[0];

  return (
    <div className="flex-1 flex flex-col h-full w-full overflow-y-auto bg-paper text-ink p-6 md:p-8 space-y-6">
      {/* Subtitle Header */}
      <div>
        <p className="text-xs text-ink/70 leading-relaxed">
          Install ready-made skills from curated repositories, or add your own source.
        </p>
      </div>

      {/* Search Input Bar */}
      <div className="relative">
        <Search size={15} className="absolute left-3 top-2.5 text-ink/40 pointer-events-none" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search skills across all sources..."
          className="w-full pl-9 pr-4 py-2 rounded-lg border border-ink/20 hover:border-ink/40 bg-paper focus:outline-none focus:border-ink text-xs text-ink transition-colors"
        />
      </div>

      {/* Sources Grid */}
      <div className="space-y-3">
        <h3 className="text-xs font-bold uppercase tracking-wider text-ink">
          Sources
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {sources.map((source) => {
            const isSelected = selectedSourceId === source.id && !searchQuery.trim();
            return (
              <div
                key={source.id}
                onClick={() => {
                  setSelectedSourceId(source.id);
                  setSearchQuery('');
                }}
                className={`p-3.5 rounded-xl border transition-all cursor-pointer select-none relative ${
                  isSelected
                    ? 'border-ink bg-ink/5 shadow-xs'
                    : 'border-ink/20 hover:border-ink/40 bg-paper'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-ink">{source.name}</span>
                    <span className="text-[10px] text-ink/50 font-mono">
                      {source.skillCount} skills
                    </span>
                  </div>
                  <RefreshCw
                    size={13}
                    className={`text-ink/40 hover:text-ink transition-colors ${
                      isRefreshing && isSelected ? 'animate-spin' : ''
                    }`}
                  />
                </div>

                <div className="mt-1 font-mono text-[11px] text-ink/60 truncate">
                  {source.repo}
                </div>

                <div className="mt-2.5 flex items-center gap-3 text-[10px] text-ink/50">
                  <span className="flex items-center gap-1">
                    <Star size={11} className="text-ink/50" />
                    <span>{source.stars}</span>
                  </span>
                  <span>{source.updatedAt}</span>
                </div>
              </div>
            );
          })}

          {/* Add Your Own Source Card */}
          <div
            onClick={() => setIsAddSourceModalOpen(true)}
            className="p-3.5 rounded-xl border border-dashed border-ink/25 hover:border-ink/50 bg-paper hover:bg-ink/[0.02] transition-all cursor-pointer flex items-center gap-3 select-none"
          >
            <div className="w-8 h-8 rounded-lg border border-ink/20 flex items-center justify-center text-ink/60 flex-shrink-0">
              <Plus size={16} />
            </div>
            <div>
              <div className="text-xs font-bold text-ink">Add your own source</div>
              <div className="text-[11px] text-ink/60">Any Git repository with skills</div>
            </div>
          </div>
        </div>
      </div>

      {/* Divider */}
      <div className="border-t border-ink/10 pt-4">
        {/* Source Results Header */}
        <div className="flex items-center justify-between pb-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-ink">
              {searchQuery.trim() ? 'Search Results' : activeSource.name.toUpperCase()}
            </span>
            <span className="text-xs text-ink/50">
              {filteredSkills.length} skill(s) found
            </span>
          </div>

          <button
            type="button"
            onClick={handleRefresh}
            title="Refresh skills"
            className="p-1 rounded-md text-ink/50 hover:text-ink hover:bg-ink/5 transition-colors cursor-pointer"
          >
            <RefreshCw size={14} className={isRefreshing ? 'animate-spin' : ''} />
          </button>
        </div>

        {/* Skills List */}
        <div className="space-y-3">
          {filteredSkills.length === 0 ? (
            <div className="text-center py-10 border border-dashed border-ink/15 rounded-xl">
              <p className="text-xs text-ink/60">No skills found matching your query.</p>
            </div>
          ) : (
            filteredSkills.map((skill) => {
              const isInstalled = installedSkillIds.has(skill.name);
              return (
                <div
                  key={skill.id}
                  className="p-4 rounded-xl border border-ink/15 hover:border-ink/30 bg-paper transition-all flex flex-col sm:flex-row sm:items-start justify-between gap-3"
                >
                  <div className="space-y-1.5 flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-ink tracking-tight font-mono">
                        {skill.name}
                      </span>
                    </div>

                    <p className="text-xs text-ink/75 leading-relaxed line-clamp-2">
                      {skill.description}
                    </p>

                    <div className="flex items-center gap-1.5 text-[11px] text-ink/50 font-mono pt-1">
                      <GitBranch size={12} className="flex-shrink-0" />
                      <span className="truncate">{skill.repoTag}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0 self-end sm:self-center">
                    {skill.githubUrl && (
                      <a
                        href={skill.githubUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="p-1.5 rounded-lg text-ink/50 hover:text-ink hover:bg-ink/5 transition-colors cursor-pointer"
                        title="View repository"
                      >
                        <ExternalLink size={14} />
                      </a>
                    )}

                    <button
                      type="button"
                      onClick={() => handleInstallToggle(skill)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 cursor-pointer ${
                        isInstalled
                          ? 'border border-ink/20 text-ink/80 hover:border-error hover:text-error hover:bg-error/5'
                          : 'bg-ink text-paper hover:bg-ink/90 shadow-xs'
                      }`}
                    >
                      {isInstalled ? (
                        <>
                          <Check size={12} />
                          <span>Installed</span>
                        </>
                      ) : (
                        <>
                          <Download size={12} />
                          <span>install</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Add Custom Source Modal */}
      <AddSourceModal
        isOpen={isAddSourceModalOpen}
        onClose={() => setIsAddSourceModalOpen(false)}
        onAddSource={handleAddSource}
      />

      {/* Floating Toast */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-ink text-paper text-xs font-medium px-4 py-2.5 rounded-lg shadow-lg animate-in fade-in slide-in-from-bottom-2 duration-150 flex items-center gap-2">
          <Check size={14} />
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );
}
