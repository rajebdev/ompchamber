import { bindingsFor, type HandlerBinding } from '@/server/lib/route-adapter';
import * as settingsRoot from '@/server/routes/settings/root';
import * as settingsAgents from '@/server/routes/settings/agents';
import * as settingsBehavior from '@/server/routes/settings/behavior';
import * as settingsCommands from '@/server/routes/settings/commands';
import * as settingsMcp from '@/server/routes/settings/mcp';
import * as settingsMcpTest from '@/server/routes/settings/mcp-test';
import * as settingsOmpConfig from '@/server/routes/settings/omp-config';
import * as settingsProjects from '@/server/routes/settings/projects';
import * as settingsProviderModels from '@/server/routes/settings/provider-models';
import * as settingsProviders from '@/server/routes/settings/providers';
import * as settingsSkills from '@/server/routes/settings/skills';
import * as settingsUsage from '@/server/routes/settings/usage';

export const settingsBindings: HandlerBinding[] = [
  ...bindingsFor(settingsRoot, '/api/settings'),
  ...bindingsFor(settingsAgents, '/api/settings/agents'),
  ...bindingsFor(settingsBehavior, '/api/settings/behavior'),
  ...bindingsFor(settingsCommands, '/api/settings/commands'),
  ...bindingsFor(settingsMcp, '/api/settings/mcp'),
  ...bindingsFor(settingsMcpTest, '/api/settings/mcp-test'),
  ...bindingsFor(settingsOmpConfig, '/api/settings/omp-config'),
  ...bindingsFor(settingsProjects, '/api/settings/projects'),
  ...bindingsFor(settingsProviderModels, '/api/settings/provider-models'),
  ...bindingsFor(settingsProviders, '/api/settings/providers'),
  ...bindingsFor(settingsSkills, '/api/settings/skills'),
  ...bindingsFor(settingsUsage, '/api/settings/usage'),
];
