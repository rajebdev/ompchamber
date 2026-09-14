import {
  BookOpen,
  Briefcase,
  Camera,
  Code2,
  Database,
  FlaskConical,
  Folder,
  Gamepad2,
  Globe,
  Heart,
  Home,
  Leaf,
  Lightbulb,
  Music,
  Palette,
  Rocket,
  Server,
  Shield,
  Smartphone,
  Terminal,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

const PROJECT_ICON_MAP: Record<string, LucideIcon> = {
  default: Folder,
  code: Code2,
  terminal: Terminal,
  rocket: Rocket,
  flask: FlaskConical,
  gamepad: Gamepad2,
  briefcase: Briefcase,
  home: Home,
  globe: Globe,
  leaf: Leaf,
  shield: Shield,
  palette: Palette,
  server: Server,
  smartphone: Smartphone,
  database: Database,
  lightbulb: Lightbulb,
  music: Music,
  camera: Camera,
  book: BookOpen,
  heart: Heart,
};

export function getProjectIcon(icon: string | undefined): LucideIcon {
  return PROJECT_ICON_MAP[icon || 'default'] || Folder;
}
