import {
  Braces,
  File,
  FileArchive,
  FileCog,
  FileImage,
  FileText,
  Folder,
  FolderOpen,
} from 'lucide-preact';
import { BRAND_ICONS, BRAND_VIEWBOX, type BrandIconName } from '@/client/components/common/file-icon/brand-paths';

interface FileIconProps {
  name: string;
  isFolder?: boolean;
  isOpen?: boolean;
  size?: number;
  className?: string;
}

/** A brand icon rendered from static path data, tinted with its official color. */
function BrandIconSvg({ name, size, className }: { name: BrandIconName; size: number; className?: string }) {
  const brand = BRAND_ICONS[name];
  return (
    <svg
      viewBox={BRAND_VIEWBOX}
      width={size}
      height={size}
      fill={brand.color}
      className={className}
      aria-hidden="true"
    >
      <path d={brand.path} />
    </svg>
  );
}

/** Extension-keyed brand mapping: file types whose icon is an official language logo. */
const EXTENSION_BRANDS: ReadonlyArray<readonly [exts: readonly string[], brand: BrandIconName]> = [
  [['tsx', 'jsx'], 'React'],
  [['ts', 'mts', 'cts'], 'Typescript'],
  [['js', 'cjs', 'mjs'], 'Javascript'],
  [['go'], 'Go'],
  [['py', 'pyi'], 'Python'],
  [['rs'], 'Rust'],
  [['php'], 'Php'],
  [['kt', 'kts'], 'Kotlin'],
  [['swift'], 'Swift'],
  [['rb'], 'Ruby'],
  [['java'], 'Openjdk'],
  [['c', 'h'], 'C'],
  [['cpp', 'cc', 'cxx', 'hpp', 'hh'], 'Cplusplus'],
  [['cs'], 'Csharp'],
  [['zig'], 'Zig'],
  [['lua'], 'Lua'],
  [['dart'], 'Dart'],
  [['ex', 'exs'], 'Elixir'],
  [['hs'], 'Haskell'],
  [['scala'], 'Scala'],
  [['pl', 'pm'], 'Perl'],
  [['jl'], 'Julia'],
  [['r'], 'R'],
  [['vue'], 'Vuedotjs'],
  [['svelte'], 'Svelte'],
  [['astro'], 'Astro'],
];

/** Extension -> brand for the exact-match pass. */
const BRAND_BY_EXT: ReadonlyMap<string, BrandIconName> = (() => {
  const map = new Map<string, BrandIconName>();
  for (const [exts, brand] of EXTENSION_BRANDS) {
    for (const ext of exts) map.set(ext, brand);
  }
  return map;
})();

export function FileIcon({ name, isFolder, isOpen, size = 14, className = '' }: FileIconProps) {
  const lowerName = name.toLowerCase();

  if (isFolder) {
    if (lowerName === 'node_modules') {
      return <BrandIconSvg name="Npm" size={size} className={className} />;
    }
    return isOpen
      ? <FolderOpen size={size} className={`text-meta ${className}`} />
      : <Folder size={size} className={`text-meta ${className}`} />;
  }

  if (lowerName === 'package.json') {
    return <BrandIconSvg name="Npm" size={size} className={className} />;
  }

  // Extension pass: brand logos first, keyed by extension.
  const dot = lowerName.lastIndexOf('.');
  if (dot >= 0) {
    const ext = lowerName.slice(dot + 1);
    const brand = BRAND_BY_EXT.get(ext);
    if (brand) return <BrandIconSvg name={brand} size={size} className={className} />;
  }

  if (lowerName.endsWith('.json')) {
    return <Braces size={size} color="#eab308" className={className} />;
  }
  if (lowerName.endsWith('.css') || lowerName.endsWith('.scss')) {
    return <BrandIconSvg name="Css" size={size} className={className} />;
  }
  if (lowerName.endsWith('.html')) {
    return <BrandIconSvg name="Html5" size={size} className={className} />;
  }
  if (lowerName.endsWith('.md') || lowerName.endsWith('.txt')) {
    return <FileText size={size} className={`text-ink/70 ${className}`} />;
  }
  if (lowerName.endsWith('.png') || lowerName.endsWith('.jpg') || lowerName.endsWith('.jpeg') || lowerName.endsWith('.svg') || lowerName.endsWith('.ico') || lowerName.endsWith('.webp')) {
    return <FileImage size={size} color="#c084fc" className={className} />;
  }
  if (lowerName.endsWith('.sh') || lowerName.endsWith('.bash')) {
    return <BrandIconSvg name="Gnubash" size={size} className={className} />;
  }
  if (lowerName.startsWith('.env') || lowerName.startsWith('.') || lowerName.includes('config')) {
    return <FileCog size={size} className={`text-ink/60 ${className}`} />;
  }
  if (lowerName.endsWith('.zip') || lowerName.endsWith('.tar.gz')) {
    return <FileArchive size={size} className={`text-warning ${className}`} />;
  }

  return <File size={size} className={`text-ink/60 ${className}`} />;
}
