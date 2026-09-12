import { json } from '@remix-run/node';
import type { LoaderFunctionArgs, ActionFunctionArgs } from '@remix-run/node';
import { getDb } from '@/db.server';
import { DEFAULT_SKILLS, DEFAULT_CATALOG_SOURCES, DEFAULT_CATALOG_SKILLS } from '@/data/settings/skill';
import { isMockMode } from '@/mock.server';
import type { SkillItem } from '@/types';
import { discoverNativeSkills, setSkillModelInvocation } from '@/lib/omp/config/skills';

const SKILLS_KEY = 'omp_skills';
const SOURCES_KEY = 'omp_catalog_sources';

/**
 * Convert a natively discovered SKILL.md into the chamber SkillItem shape.
 * location/locationLabel reflect the real disk root the skill came from.
 */
function nativeToSkillItem(skill: ReturnType<typeof discoverNativeSkills>[number]): SkillItem {
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
function mergeSkills(custom: SkillItem[]): SkillItem[] {
  const native = discoverNativeSkills().map(nativeToSkillItem);
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

    const mergedSkills = includeNative && !mock ? mergeSkills(skills) : skills;

    return json({
      skills: mergedSkills,
      catalogSources,
      catalogSkills: DEFAULT_CATALOG_SKILLS,
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
      let list: SkillItem[] = DEFAULT_SKILLS;
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
        const skill = discoverNativeSkills().find(
          (s) => s.name === nameParts.join('-') && s.sourceRoot === sourceRoot,
        );
        if (!skill) return json({ error: 'Skill not found' }, { status: 404 });
        const changed = setSkillModelInvocation(skill.filePath, body.disable === true);
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
        let skills: SkillItem[] = DEFAULT_SKILLS;
        if (row?.value) {
          try { skills = JSON.parse(row.value); } catch {}
        }

        if (install) {
          if (!skills.some(s => s.name === skill.name)) {
            skills.push({
              id: `skill-${Date.now()}`,
              name: skill.name,
              description: skill.description,
              location: 'user',
              locationLabel: 'User / OpenCode',
              instructions: `Autonomous guidelines for ${skill.name}. Adhere strictly to skill instructions.`,
              project: 'ompchamber',
            });
          }
        } else {
          skills = skills.filter(s => s.name !== skill.name);
        }

        await db.run('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)', [
          SKILLS_KEY,
          JSON.stringify(skills),
        ]);
        return json({ success: true, skills: isMockMode() ? skills : mergeSkills(skills) });
      }

      let updatedSkills: SkillItem[] = [];
      if (Array.isArray(body)) {
        updatedSkills = body;
      } else if (Array.isArray(body.skills)) {
        updatedSkills = body.skills;
      } else if (body.skill) {
        const row = await db.get('SELECT value FROM app_settings WHERE key = ?', [SKILLS_KEY]);
        let list: SkillItem[] = DEFAULT_SKILLS;
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
