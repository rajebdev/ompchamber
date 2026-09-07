export interface ProjectConfigItem {
  id: string;
  name: string;
  path: string;
  model: string;
  accentColor: string;
  icon: string;
  customIconUrl?: string;
}

export interface AccentColorOption {
  label: string;
  value: string;
  bgHex: string;
}
