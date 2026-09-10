import { Trash2 } from 'lucide-react';
import type { ProjectConfigItem } from '@/types';

interface ProjectDetailsHeaderProps {
  project: ProjectConfigItem;
  canDelete: boolean;
  onDelete: () => void;
}

export function ProjectDetailsHeader({
  project,
  canDelete,
  onDelete,
}: ProjectDetailsHeaderProps) {
  return (
    <div className="flex items-start justify-between gap-4 pb-4 border-b border-ink/10">
      <div className="min-w-0 flex-1">
        <h2 className="text-xl font-bold tracking-tight text-ink truncate">
          {project.name}
        </h2>
        <p className="text-[11px] font-mono text-ink/50 truncate mt-0.5 select-all">
          {project.path}
        </p>
      </div>

      {canDelete && (
        <button
          type="button"
          onClick={onDelete}
          title="Delete Project"
          className="p-1.5 text-ink/40 hover:text-error hover:bg-error/10 rounded-md transition-colors cursor-pointer"
        >
          <Trash2 size={15} />
        </button>
      )}
    </div>
  );
}
