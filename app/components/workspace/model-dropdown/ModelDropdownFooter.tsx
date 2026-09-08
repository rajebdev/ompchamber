
export function ModelDropdownFooter() {
  return (
    <div className="flex items-center justify-between px-3 py-1.5 border-t border-ink/10 bg-canvas/60 text-[10px] text-ink/50 font-mono select-none">
      <div className="flex items-center space-x-3">
        <span className="flex items-center space-x-1">
          <span className="text-ink/70">↑ ↓</span>
          <span>navigate</span>
        </span>
        <span className="flex items-center space-x-1">
          <span className="text-ink/70">Tab</span>
          <span>switch agent</span>
        </span>
        <span className="flex items-center space-x-1">
          <span className="text-ink/70">← →</span>
          <span>thinking</span>
        </span>
      </div>
    </div>
  );
}
