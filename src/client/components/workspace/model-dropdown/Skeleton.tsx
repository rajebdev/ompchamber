/**
 * Placeholder rows for the model picker while the first `/api/models` fetch is
 * in flight. Mirrors the shape of ModelDropdownSection (a provider heading plus
 * indented model rows) so the swap-in does not jump, and occupies roughly the
 * same height as a two-provider registry.
 */

const SKELETON_GROUPS = [3, 2];

export function ModelDropdownSkeleton() {
  return (
    <div className="space-y-2" aria-hidden="true">
      {SKELETON_GROUPS.map((rows, groupIndex) => (
        <div key={groupIndex} className="space-y-0.5">
          <div className="flex items-center space-x-1.5 px-2 py-1">
            <span className="w-2.5 h-2.5 rounded-sm animate-pulse bg-ink/10" />
            <span className="h-2.5 w-20 rounded animate-pulse bg-ink/10" />
          </div>

          {Array.from({ length: rows }, (_, rowIndex) => (
            <div
              key={rowIndex}
              className="flex items-center justify-between px-2.5 py-1.5"
            >
              <div className="flex items-center space-x-2 min-w-0 flex-1 mr-2">
                <span className="w-3 h-3 rounded-sm animate-pulse bg-ink/10 flex-shrink-0" />
                <span
                  className="h-3 rounded animate-pulse bg-ink/10"
                  style={{ width: `${52 - ((rowIndex + groupIndex) % 3) * 10}%` }}
                />
              </div>
              <span className="h-4 w-9 rounded animate-pulse bg-ink/10 flex-shrink-0" />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
