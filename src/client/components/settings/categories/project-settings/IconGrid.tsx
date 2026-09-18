import { useRef } from 'preact/hooks';
import type { ChangeEvent } from 'preact/compat';
import { BookOpen, Briefcase, Camera, Code2, Compass, Database, FlaskConical, Gamepad2, Globe, Heart, Home, Leaf, Lightbulb, Music, Palette, Rocket, Server, Shield, Smartphone, Terminal, Upload, X } from 'lucide-preact';

interface ProjectIconGridProps {
  currentIcon: string;
  customIconUrl?: string;
  projectName: string;
  onSelectIcon: (iconId: string) => void;
  onSetCustomIcon: (url: string | undefined) => void;
}

const AVAILABLE_ICONS = [
  { id: 'default', label: 'Default Folder', icon: X },
  { id: 'code', label: 'Code', icon: Code2 },
  { id: 'terminal', label: 'Terminal', icon: Terminal },
  { id: 'rocket', label: 'Rocket', icon: Rocket },
  { id: 'flask', label: 'Flask', icon: FlaskConical },
  { id: 'gamepad', label: 'Gamepad', icon: Gamepad2 },
  { id: 'briefcase', label: 'Briefcase', icon: Briefcase },
  { id: 'home', label: 'Home', icon: Home },
  { id: 'globe', label: 'Globe', icon: Globe },
  { id: 'leaf', label: 'Leaf', icon: Leaf },
  { id: 'shield', label: 'Shield', icon: Shield },
  { id: 'palette', label: 'Palette', icon: Palette },
  { id: 'server', label: 'Server', icon: Server },
  { id: 'smartphone', label: 'Smartphone', icon: Smartphone },
  { id: 'database', label: 'Database', icon: Database },
  { id: 'lightbulb', label: 'Lightbulb', icon: Lightbulb },
  { id: 'music', label: 'Music', icon: Music },
  { id: 'camera', label: 'Camera', icon: Camera },
  { id: 'book', label: 'Book', icon: BookOpen },
  { id: 'heart', label: 'Heart', icon: Heart },
];

export function ProjectIconGrid({
  currentIcon,
  customIconUrl,
  projectName,
  onSelectIcon,
  onSetCustomIcon,
}: ProjectIconGridProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.currentTarget.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result as string;
      if (result) {
        onSetCustomIcon(result);
        onSelectIcon('custom');
      }
    };
    reader.readAsDataURL(file);
    e.currentTarget.value = '';
  };

  const handleDiscoverFavicon = () => {
    // Generate clean favicon URL for project
    const sanitized = projectName.toLowerCase().replace(/[^a-z0-9]/g, '') || 'app';
    const generatedFavicon = `https://api.dicebear.com/7.x/identicon/svg?seed=${sanitized}&radius=50`;
    onSetCustomIcon(generatedFavicon);
    onSelectIcon('custom');
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold text-ink">Project Icon</h4>
        {customIconUrl && (
          <button
            type="button"
            onClick={() => onSetCustomIcon(undefined)}
            className="text-[11px] text-ink/50 hover:text-error transition-colors cursor-pointer"
          >
            Reset to standard icon
          </button>
        )}
      </div>

      {/* 20 Icons Grid */}
      <div className="flex flex-wrap gap-2">
        {AVAILABLE_ICONS.map((item) => {
          const isSelected = !customIconUrl && currentIcon === item.id;
          const IconComp = item.icon;

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                onSetCustomIcon(undefined);
                onSelectIcon(item.id);
              }}
              title={item.label}
              className={`w-7 h-7 rounded-md flex items-center justify-center transition-all cursor-pointer ${
                isSelected
                  ? 'border border-ink/40 bg-ink/5 text-ink shadow-2xs'
                  : 'text-ink/60 hover:text-ink hover:bg-ink/5'
              }`}
            >
              <IconComp size={14} strokeWidth={1.8} />
            </button>
          );
        })}
      </div>

      {/* Action Buttons: Upload & Discover */}
      <div className="flex items-center gap-2 pt-1">
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileUpload}
          accept="image/*"
          className="hidden"
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-ink/20 hover:border-ink/40 bg-paper text-ink text-xs font-medium transition-colors cursor-pointer shadow-2xs"
        >
          <Upload size={13} className="text-ink/60" />
          <span>upload icon</span>
        </button>

        <button
          type="button"
          onClick={handleDiscoverFavicon}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-ink/20 hover:border-ink/40 bg-paper text-ink text-xs font-medium transition-colors cursor-pointer shadow-2xs"
        >
          <Compass size={13} className="text-ink/60" />
          <span>discover favicon</span>
        </button>

        {customIconUrl && (
          <div className="flex items-center gap-2 ml-2 pl-2 border-l border-ink/10">
            <img
              src={customIconUrl}
              alt="Custom icon"
              className="w-5 h-5 rounded-xs object-contain border border-ink/15"
              referrerPolicy="no-referrer"
            />
            <span className="text-[11px] text-ink/60">Custom active</span>
          </div>
        )}
      </div>
    </div>
  );
}
