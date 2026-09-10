import {
  Sparkles,
  Network,
  TerminalSquare,
  Zap,
  Bot,
  Boxes,
  Flame,
  Globe,
  Server,
  Cloud,
} from 'lucide-react';

interface ProviderIconProps {
  icon: string;
  size?: number;
  className?: string;
}

export function ProviderIcon({ icon, size = 16, className = '' }: ProviderIconProps) {
  switch (icon) {
    case 'deepseek':
      // Whale / Spiral glyph
      return <Sparkles size={size} className={`text-sky-400 ${className}`} />;
    case 'agentrouter':
      return <Network size={size} className={`text-emerald-400 ${className}`} />;
    case 'commandcode':
      return <TerminalSquare size={size} className={`text-amber-400 ${className}`} />;
    case 'opencode':
      return <Zap size={size} className={`text-violet-400 ${className}`} />;
    case 'claude':
      return <Bot size={size} className={`text-orange-400 ${className}`} />;
    case 'openai':
      return <Boxes size={size} className={`text-emerald-400 ${className}`} />;
    case 'gemini':
      return <Sparkles size={size} className={`text-blue-400 ${className}`} />;
    case 'groq':
      return <Flame size={size} className={`text-amber-500 ${className}`} />;
    case 'ollama':
      return <Server size={size} className={`text-slate-400 ${className}`} />;
    case 'mistral':
      return <Globe size={size} className={`text-rose-400 ${className}`} />;
    default:
      return <Cloud size={size} className={`text-ink/60 ${className}`} />;
  }
}
