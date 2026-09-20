import { useCallback, useEffect, useState } from 'preact/hooks';
import type { Dispatch, StateUpdater } from 'preact/hooks';
import type { CatalogSkillItem, SkillCatalogSource, SkillItem } from '@/shared/types';

export interface SkillCatalogData {
  sources: SkillCatalogSource[];
  catalogSkills: CatalogSkillItem[];
  userSkills: SkillItem[];
  setSources: Dispatch<StateUpdater<SkillCatalogSource[]>>;
  setUserSkills: Dispatch<StateUpdater<SkillItem[]>>;
  reload: () => Promise<void>;
}

/**
 * Catalog dataset behind the skill catalog screen. The initial load and the
 * manual refresh hit the same endpoint and set the same three slices, so both
 * go through `reload`; each call site keeps its own toast/error handling.
 */
export function useSkillCatalog(): SkillCatalogData {
  const [sources, setSources] = useState<SkillCatalogSource[]>([]);
  const [catalogSkills, setCatalogSkills] = useState<CatalogSkillItem[]>([]);
  const [userSkills, setUserSkills] = useState<SkillItem[]>([]);

  const reload = useCallback(async () => {
    const res = await fetch('/api/settings/skills');
    const data = await res.json();
    if (data?.catalogSources) setSources(data.catalogSources);
    if (data?.catalogSkills) setCatalogSkills(data.catalogSkills);
    if (data?.skills) setUserSkills(data.skills);
  }, []);

  useEffect(() => {
    reload().catch(console.error);
  }, [reload]);

  return { sources, catalogSkills, userSkills, setSources, setUserSkills, reload };
}
