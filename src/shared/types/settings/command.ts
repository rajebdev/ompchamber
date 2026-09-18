export type CommandScope = 'system' | 'user' | 'project';

export interface CommandItem {
  id: string;
  name: string;
  description: string;
  scope: CommandScope;
  overrideAgent?: string;
  overrideModel?: string;
  template: string;
  isBuiltIn?: boolean;
}
