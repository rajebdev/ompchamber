import { json } from '@remix-run/node';
import type { LoaderFunctionArgs } from '@remix-run/node';
import { isMockMode } from '@/mock.server';
import { runUtilityCommand } from '@/lib/omp/rpc/utility';

/**
 * Live slash-command/skill/extension discovery from the omp agent
 * (get_available_commands). Each command carries its source
 * (builtin | skill | extension | custom | mcp_prompt | file), so the skills
 * and commands settings tabs can merge real agent-registered entries.
 */
export async function loader({ request }: LoaderFunctionArgs) {
  const mock = isMockMode();
  if (mock) {
    return json({ commands: [], isMock: true });
  }
  const url = new URL(request.url);
  const source = url.searchParams.get('source');
  try {
    const data = await runUtilityCommand<{ commands?: unknown }>({ type: 'get_available_commands' }, 30_000);
    const commands = Array.isArray(data.commands) ? data.commands : [];
    const filtered = source
      ? commands.filter((c) => (c as { source?: string })?.source === source)
      : commands;
    return json({ commands: filtered, isMock: false });
  } catch (error: any) {
    return json({ commands: [], isMock: false, error: error.message });
  }
}
