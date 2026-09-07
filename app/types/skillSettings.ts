export type SkillLocation = 'user' | 'project';

export interface SkillItem {
  id: string;
  name: string;
  description: string;
  location: SkillLocation;
  locationLabel?: string;
  group?: string;
  instructions: string;
  project: string;
  isInstalledFromCatalog?: boolean;
  catalogSource?: string;
}

export interface SkillCatalogSource {
  id: string;
  name: string;
  repo: string;
  stars: string;
  updatedAt: string;
  skillCount: number;
  isCustom?: boolean;
}

export interface CatalogSkillItem {
  id: string;
  sourceId: string;
  name: string;
  description: string;
  repoTag: string;
  githubUrl?: string;
  instructions?: string;
  installed?: boolean;
}
