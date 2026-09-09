import { CheckCircle2, Circle } from 'lucide-react';

interface AskDialogSelectBodyProps {
  options: string[];
  optionDetails: { description?: string }[];
  selectedOption: string | null;
  onSelect: (option: string) => void;
  onConfirmOption: (option: string) => void;
}

export function AskDialogSelectBody({
  options,
  optionDetails,
  selectedOption,
  onSelect,
  onConfirmOption,
}: AskDialogSelectBodyProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-[11px] font-medium tracking-wider text-ink/50 uppercase">
        <span>Available Options</span>
        <span className="font-mono text-[10px] text-ink/40">Press [1-{Math.min(9, options.length)}] to choose</span>
      </div>
      <div className="grid gap-2" role="radiogroup">
        {options.map((option, index) => {
          const isSelected = selectedOption === option;
          const detail = optionDetails[index]?.description;

          return (
            <button
              key={option}
              type="button"
              onClick={() => onSelect(option)}
              onDoubleClick={() => onConfirmOption(option)}
              aria-checked={isSelected}
              role="radio"
              className={`group flex w-full cursor-pointer items-start gap-3 rounded-xl border p-3.5 text-left transition-all ${
                isSelected
                  ? 'border-ink bg-paper shadow-sm ring-1 ring-ink/10'
                  : 'border-ink/10 bg-canvas/30 hover:border-ink/25 hover:bg-paper'
              }`}
            >
              {/* Shortcut key indicator */}
              <span
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md font-mono text-[11px] font-semibold transition-colors ${
                  isSelected
                    ? 'bg-ink text-paper'
                    : 'border border-ink/15 bg-paper text-ink/60 group-hover:border-ink/30 group-hover:text-ink'
                }`}
              >
                {index + 1}
              </span>

              {/* Option label & description */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className={`text-[13px] font-medium leading-snug ${isSelected ? 'text-ink font-semibold' : 'text-ink/85'}`}>
                    {option}
                  </span>
                </div>
                {detail && (
                  <div className="mt-1 text-[11.5px] leading-relaxed text-ink/55">
                    {detail}
                  </div>
                )}
              </div>

              {/* Status Radio / Check */}
              <span className="mt-0.5 shrink-0">
                {isSelected ? (
                  <CheckCircle2 size={16} className="text-ink" />
                ) : (
                  <Circle size={16} className="text-ink/20 group-hover:text-ink/40" />
                )}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
