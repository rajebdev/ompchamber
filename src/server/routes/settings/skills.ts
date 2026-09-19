import { json } from '@/server/lib/remix-compat';
import type { ActionFunctionArgs, LoaderFunctionArgs } from '@/server/lib/remix-compat';
import { getDb } from '@/server/db.server';
import { DEFAULT_CATALOG_SKILLS, DEFAULT_CATALOG_SOURCES, DEFAULT_SKILLS } from '@/client/data/settings/skill';
import { isMockMode } from '@/server/mock.server';
import type { SkillItem } from '@/shared/types';
import { discoverNativeSkills, setSkillModelInvocation, type DiscoveredSkill } from '@/server/lib/omp/config/skills';
import { installCatalogSkill, searchSkillCatalog, toCatalogSkills } from '@/server/lib/omp/config/skills-catalog';

const SKILLS_KEY = 'omp_skills';
const SOURCES_KEY = 'omp_catalog_sources';

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
    const skillsRow = await db.get('SELECT value FROM app_settings WHERE key = ?', [SKILLS_KEY]);
    const sourcesRow = await db.get('SELECT value FROM app_settings WHERE key = ?', [SOURCES_KEY]);
    const mock = isMockMode();

    let skills: SkillItem[] = mock ? DEFAULT_SKILLS : [];
    let catalogSources: typeof DEFAULT_CATALOG_SOURCES = DEFAULT_CATALOG_SOURCES;

    if (skillsRow?.value) {
      try {
        const parsed = JSON.parse(skillsRow.value);
        if (Array.isArray(parsed)) skills = parsed;
      } catch {}
    } else if (mock) {
      await db.run('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)', [
        SKILLS_KEY,
        JSON.stringify(DEFAULT_SKILLS),
      ]);
    }

    if (sourcesRow?.value) {
      try {
        const parsed = JSON.parse(sourcesRow.value);
        if (Array.isArray(parsed) && parsed.length > 0) catalogSources = parsed;
      } catch {}
    }

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

export async function action({ request }: ActionFunctionArgs) {
  try {
    const db = await getDb();

    if (request.method === 'DELETE') {
      const url = new URL(request.url);
      const id = url.searchParams.get('id');
      if (!id) return json({ error: 'id is required' }, { status: 400 });
      if (id.startsWith('omp-')) {
        return json({ error: 'Native omp skills are managed on disk' }, { status: 403 });
      }

      const row = await db.get('SELECT value FROM app_settings WHERE key = ?', [SKILLS_KEY]);
      let list: SkillItem[] = isMockMode() ? DEFAULT_SKILLS : [];
      if (row?.value) {
        try { list = JSON.parse(row.value); } catch {}
      }
      list = list.filter(s => s.id !== id);
      await db.run('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)', [
        SKILLS_KEY,
        JSON.stringify(list),
      ]);
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
        const row = await db.get('SELECT value FROM app_settings WHERE key = ?', [SOURCES_KEY]);
        let sources: typeof DEFAULT_CATALOG_SOURCES = DEFAULT_CATALOG_SOURCES;
        if (row?.value) {
          try { sources = JSON.parse(row.value); } catch {}
        }
        sources = [...sources, body.source];
        await db.run('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)', [
          SOURCES_KEY,
          JSON.stringify(sources),
        ]);
        return json({ success: true, catalogSources: sources });
      }

      if (body.type === 'install_toggle') {
        const { skill, install } = body;
        const row = await db.get('SELECT value FROM app_settings WHERE key = ?', [SKILLS_KEY]);
        let skills: SkillItem[] = isMockMode() ? DEFAULT_SKILLS : [];
        if (row?.value) {
          try { skills = JSON.parse(row.value); } catch {}
        }

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

        await db.run('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)', [
          SKILLS_KEY,
          JSON.stringify(skills),
        ]);
        return json({ success: true, skills: isMockMode() ? skills : await mergeSkills(skills) });
      }

      let updatedSkills: SkillItem[] = [];
      if (Array.isArray(body)) {
        updatedSkills = body;
      } else if (Array.isArray(body.skills)) {
        updatedSkills = body.skills;
      } else if (body.skill) {
        // Catalog skill POST installs via the skills.sh CLI: the component
        // echoes the package back in instructions (and may include repoTag).
        const pkg = typeof body.skill.repoTag === 'string' && /^[\w.\-]+\/[\w.\-@:]+$/.test(body.skill.repoTag)
          ? body.skill.repoTag
          : (typeof body.skill.instructions === 'string' && /^[\w.\-]+\/[\w.\-@:]+$/.test(body.skill.instructions) ? body.skill.instructions : null);
        if (!isMockMode() && pkg) await installCatalogSkill(pkg);
        const row = await db.get('SELECT value FROM app_settings WHERE key = ?', [SKILLS_KEY]);
        let list: SkillItem[] = isMockMode() ? DEFAULT_SKILLS : [];
        if (row?.value) {
          try { list = JSON.parse(row.value); } catch {}
        }
        const idx = list.findIndex(s => s.id === body.skill.id);
        if (idx >= 0) {
          list[idx] = body.skill;
        } else {
          list.push(body.skill);
        }
        updatedSkills = list;
      }

      await db.run('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)', [
        SKILLS_KEY,
        JSON.stringify(updatedSkills),
      ]);

      return json({ success: true, skills: isMockMode() ? updatedSkills : mergeSkills(updatedSkills) });
    }

    return json({ error: 'Method not allowed' }, { status: 405 });
  } catch (error: any) {
    return json({ error: error.message }, { status: 500 });
  }
}
