import { 
  VscFolder, 
  VscFolderOpened, 
  VscFile,
  VscFileMedia,
  VscFileZip,
  VscJson,
  VscSettingsGear
} from 'react-icons/vsc';
import { 
  SiTypescript, 
  SiJavascript, 
  SiReact, 
  SiHtml5, 
  SiCss, 
  SiMarkdown,
  SiGnubash,
  SiNpm
} from 'react-icons/si';

interface FileIconProps {
  name: string;
  isFolder?: boolean;
  isOpen?: boolean;
  size?: number;
  className?: string;
}

export function FileIcon({ name, isFolder, isOpen, size = 14, className = '' }: FileIconProps) {
  const lowerName = name.toLowerCase();

  if (isFolder) {
    if (lowerName === 'node_modules') {
      return <SiNpm size={size} color="#CB3837" className={className} />;
    }
    return isOpen 
      ? <VscFolderOpened size={size} className={`text-meta ${className}`} /> 
      : <VscFolder size={size} className={`text-meta ${className}`} />;
  }

  // Exact matches
  if (lowerName === 'package.json') {
    return <SiNpm size={size} color="#CB3837" className={className} />;
  }

  // Extensions
  if (lowerName.endsWith('.tsx') || lowerName.endsWith('.jsx')) {
    return <SiReact size={size} color="#61DAFB" className={className} />;
  }
  if (lowerName.endsWith('.ts')) {
    return <SiTypescript size={size} color="#3178C6" className={className} />;
  }
  if (lowerName.endsWith('.js') || lowerName.endsWith('.cjs') || lowerName.endsWith('.mjs')) {
    return <SiJavascript size={size} color="#F7DF1E" className={className} />;
  }
  if (lowerName.endsWith('.json')) {
    return <VscJson size={size} color="#eab308" className={className} />; // Tailwind yellow-500
  }
  if (lowerName.endsWith('.css') || lowerName.endsWith('.scss')) {
    return <SiCss size={size} color="#1572B6" className={className} />;
  }
  if (lowerName.endsWith('.html')) {
    return <SiHtml5 size={size} color="#E34F26" className={className} />;
  }
  if (lowerName.endsWith('.md') || lowerName.endsWith('.txt')) {
    return <SiMarkdown size={size} className={`text-ink/70 ${className}`} />;
  }
  if (lowerName.endsWith('.png') || lowerName.endsWith('.jpg') || lowerName.endsWith('.jpeg') || lowerName.endsWith('.svg') || lowerName.endsWith('.ico') || lowerName.endsWith('.webp')) {
    return <VscFileMedia size={size} color="#c084fc" className={className} />; // Tailwind purple-400
  }
  if (lowerName.endsWith('.sh') || lowerName.endsWith('.bash')) {
    return <SiGnubash size={size} className={`text-success ${className}`} />;
  }
  if (lowerName.startsWith('.env') || lowerName.startsWith('.') || lowerName.includes('config')) {
    return <VscSettingsGear size={size} className={`text-ink/60 ${className}`} />;
  }
  if (lowerName.endsWith('.zip') || lowerName.endsWith('.tar.gz')) {
    return <VscFileZip size={size} className={`text-warning ${className}`} />;
  }

  return <VscFile size={size} className={`text-ink/60 ${className}`} />;
}
