import { Plus, Search, X } from 'lucide-preact';

interface ModelDropdownHeaderProps {
  search: string;
  onSearchChange: (value: string) => void;
  onAddProvider?: () => void;
}

export function ModelDropdownHeader({
  search,
  onSearchChange,
  onAddProvider,
}: ModelDropdownHeaderProps) {
  return (
    <div className="flex flex-col border-b border-ink/10 bg-canvas/40">
      {/* Top Add New Provider Action Button */}
      <button
        type="button"
        onClick={onAddProvider}
        className="w-full flex items-center space-x-2 px-3 py-2 text-xs text-ink/70 hover:text-ink hover:bg-ink/5 transition-colors text-left font-medium cursor-pointer border-b border-ink/5"
      >
        <Plus size={14} className="text-ink/60" />
        <span>Add new provider</span>
      </button>

      {/* Search Input */}
      <div className="p-2 flex items-center bg-canvas/60">
        <Search size={13} className="text-ink/40 mr-2 flex-shrink-0" />
        <input
          type="text"
          value={search}
          onChange={(e) => onSearchChange(e.currentTarget.value)}
          placeholder="Search models"
          className="bg-transparent border-none focus:outline-none w-full text-ink placeholder-ink/40 text-xs font-sans"
          autoFocus
        />
        {search && (
          <button
            type="button"
            onClick={() => onSearchChange('')}
            className="p-0.5 text-ink/40 hover:text-ink transition-colors cursor-pointer"
            title="Clear search"
          >
            <X size={12} />
          </button>
        )}
      </div>
    </div>
  );
}
