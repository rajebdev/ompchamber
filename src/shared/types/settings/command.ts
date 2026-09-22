export type CommandScope = 'system' | 'user' | 'project';

/** Declarative subcommand of an oh-my-pi builtin (drives `/cmd <sub>` completion). */
export interface CommandSubcommand {
  name: string;
  description?: string;
  usage?: string;
}

export interface CommandItem {
  id: string;
  name: string;
  description: string;
  scope: CommandScope;
  overrideAgent?: string;
  overrideModel?: string;
  template: string;
  isBuiltIn?: boolean;
  /** oh-my-pi aliases (`/models` for `/model`); live agent commands only. */
  aliases?: string[];
  /** Declarative subcommands; live agent commands only. */
  subcommands?: CommandSubcommand[];
  /** Argument hint (`[on|off|status]`); live agent commands only. */
  inputHint?: string;
}
