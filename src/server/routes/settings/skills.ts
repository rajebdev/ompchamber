import { json } from '@/server/lib/remix-compat';
import type { ActionFunctionArgs, LoaderFunctionArgs } from '@/server/lib/remix-compat';
import { methodNotAllowed } from '@/server/lib/route-adapter';
import { getDb } from '@/server/db.server';
import { DEFAULT_CATALOG_SKILLS, DEFAULT_CATALOG_SOURCES, DEFAULT_SKILLS } from '@/client/data/settings/skill';
import { isMockMode } from '@/server/mock.server';
import type { SkillItem } from '@/shared/types';
import { createSettingsListStore, readSettingsJson, writeSettingsJson } from '@/server/lib/db/settings-store';
import { discoverNativeSkills, setSkillModelInvocation, type DiscoveredSkill } from '@/server/lib/omp/config/skills';
import { installCatalogSkill, searchSkillCatalog, toCatalogSkills } from '@/server/lib/omp/config/skills-catalog';

const SKILLS_KEY = 'omp_skills';
const SOURCES_KEY = 'omp_catalog_sources';

const skillsStore = createSettingsListStore<SkillItem>({
  key: SKILLS_KEY,
  mockDefaults: DEFAULT_SKILLS,
  idOf: (skill) => skill.id,
  singular: 'skill',
  plural: 'skills',
});

/**
 * Convert a natively discovered SKILL.md into the chamber SkillItem shape.
 * location/locationLabel reflect the real disk root the skill came from.
 */
function nativeToSkillItem(skill: DiscoveredSkill): SkillItem {
  return {
    id: skill.id,
    name: skill.name,
    description: skill.description,
    location: skill.sourceRoot,
    locationLabel: skill.sourceRoot === 'user' ? 'User / OMP agent' : 'Project / .omp/skills',
    instructions: skill.filePath,
    project: 'omp',
  };
}

/** Merge native omp skills (disk scan) with app-local custom skills. */
async function mergeSkills(custom: SkillItem[]): Promise<SkillItem[]> {
  const native = (await discoverNativeSkills()).map(nativeToSkillItem);
  const nativeNames = new Set(native.map((s) => s.name.toLowerCase()));
  return [...native, ...custom.filter((s) => !nativeNames.has(s.name.toLowerCase()))];
}

export async function loader({ request }: LoaderFunctionArgs) {
  try {
    const db = await getDb();
    const url = new URL(request.url);
    const includeNative = url.searchParams.get('native') === '1' || !isMockMode();
    const mock = isMockMode();

    const skills = await skillsStore.read(db);
    const storedSources = await readSettingsJson<typeof DEFAULT_CATALOG_SOURCES>(db, SOURCES_KEY, DEFAULT_CATALOG_SOURCES);
    const catalogSources = Array.isArray(storedSources) && storedSources.length > 0 ? storedSources : DEFAULT_CATALOG_SOURCES;

    const mergedSkills = includeNative && !mock ? await mergeSkills(skills) : skills;

    let catalogSkills = DEFAULT_CATALOG_SKILLS;
    if (!mock) {
      const [popular, curated] = await Promise.all([
        searchSkillCatalog('popular', 18),
        searchSkillCatalog('code review', 8),
      ]);
      const seen = new Set<string>();
      catalogSkills = toCatalogSkills([...popular, ...curated], catalogSources[0]?.id ?? 'skills-sh')
        .filter((item) => (seen.has(item.repoTag) ? false : (seen.add(item.repoTag), true)));
    }

    return json({
      skills: mergedSkills,
      catalogSources,
      catalogSkills,
      isMock: mock,
    });
  } catch (error: any) {
    const mock = isMockMode();
    return json({
      error: error.message,
      skills: mock ? DEFAULT_SKILLS : [],
      catalogSources: DEFAULT_CATALOG_SOURCES,
      catalogSkills: DEFAULT_CATALOG_SKILLS,
      isMock: mock,
    }, { status: 500 });
  }
}

export async function action({ request, params }: ActionFunctionArgs) {
  try {
    const db = await getDb();

    if (request.method === 'DELETE') {
      const url = new URL(request.url);
      const id = url.searchParams.get('id');
      if (!id) return json({ error: 'id is required' }, { status: 400 });
      if (id.startsWith('omp-')) {
        return json({ error: 'Native omp skills are managed on disk' }, { status: 403 });
      }

      const list = await skillsStore.remove(db, id);
      return json({ success: true, skills: list });
    }

    if (request.method === 'POST' || request.method === 'PUT') {
      const body = await request.json();

      // Toggle model invocation on a native skill file (frontmatter edit).
      if (body.type === 'toggle_model_invocation' && typeof body.skillId === 'string' && body.skillId.startsWith('omp-')) {
        const [root, sourceRoot, ...nameParts] = body.skillId.split('-');
        void root;
        const skill = (await discoverNativeSkills()).find(
          (s) => s.name === nameParts.join('-') && s.sourceRoot === sourceRoot,
        );
        if (!skill) return json({ error: 'Skill not found' }, { status: 404 });
        const changed = await setSkillModelInvocation(skill.filePath, body.disable === true);
        return json({ success: changed, disable: body.disable === true });
      }

      if (body.type === 'add_source') {
        const sources = await readSettingsJson<typeof DEFAULT_CATALOG_SOURCES>(db, SOURCES_KEY, DEFAULT_CATALOG_SOURCES);
        const updated = [...sources, body.source];
        await writeSettingsJson(db, SOURCES_KEY, updated);
        return json({ success: true, catalogSources: updated });
      }

      if (body.type === 'install_toggle') {
        const { skill, install } = body;
        let skills = await skillsStore.read(db);

        if (install) {
          // Catalog skill with a package tag installs via the real skills.sh CLI.
          if (typeof skill.repoTag === 'string' && /^[\w.\-]+\/[\w.\-@:]+$/.test(skill.repoTag)) {
            await installCatalogSkill(skill.repoTag);
          }
          if (!skills.some(s => s.name === skill.name)) {
            skills.push({
              id: `skill-${Date.now()}`,
              name: skill.name,
              description: skill.description,
              location: 'user',
              locationLabel: 'User / OMP agent',
              instructions: skill.instructions || `Autonomous guidelines for ${skill.name}. Adhere strictly to skill instructions.`,
              project: 'omp',
              isInstalledFromCatalog: true,
              catalogSource: skill.catalogSource ?? skill.sourceId,
            });
          }
        } else {
          skills = skills.filter(s => s.name !== skill.name);
        }

        await skillsStore.write(db, skills);
        return json({ success: true, skills: isMockMode() ? skills : await mergeSkills(skills) });
      }

      // Catalog skill POST installs via the skills.sh CLI: the component
      // echoes the package back in instructions (and may include repoTag).
      if (body.skill) {
        const pkg = typeof body.skill.repoTag === 'string' && /^[\w.\-]+\/[\w.\-@:]+$/.test(body.skill.repoTag)
          ? body.skill.repoTag
          : (typeof body.skill.instructions === 'string' && /^[\w.\-]+\/[\w.\-@:]+$/.test(body.skill.instructions) ? body.skill.instructions : null);
        if (!isMockMode() && pkg) await installCatalogSkill(pkg);
      }

      const updatedSkills = await skillsStore.upsert(db, body);
      await skillsStore.write(db, updatedSkills);

      return json({ success: true, skills: isMockMode() ? updatedSkills : mergeSkills(updatedSkills) });
    }

    return methodNotAllowed({ request, params });
  } catch (error: any) {
    return json({ error: error.message }, { status: 500 });
  }
}
