
interface TokenDistributionBarProps {
  userPercent: number;
  assistantPercent: number;
  toolPercent: number;
  otherPercent: number;
}

export function TokenDistributionBar({
  userPercent,
  assistantPercent,
  toolPercent,
  otherPercent
}: TokenDistributionBarProps) {
  return (
    <div className="space-y-2.5">
      {/* Multi-segment distribution bar */}
      <div className="w-full h-1.5 rounded-full overflow-hidden flex bg-ink/10">
        <div
          className="h-full bg-emerald-500 transition-all duration-300"
          style={{ width: `${userPercent}%` }}
          title={`User: ${userPercent}%`}
        />
        <div
          className="h-full bg-sky-500 transition-all duration-300"
          style={{ width: `${assistantPercent}%` }}
          title={`Assistant: ${assistantPercent}%`}
        />
        <div
          className="h-full bg-amber-500 transition-all duration-300"
          style={{ width: `${toolPercent}%` }}
          title={`Tool Calls: ${toolPercent}%`}
        />
        <div
          className="h-full bg-slate-400 transition-all duration-300"
          style={{ width: `${otherPercent}%` }}
          title={`Other: ${otherPercent}%`}
        />
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-ink/70">
        <div className="flex items-center space-x-1.5">
          <span className="w-2 h-2 rounded-full bg-emerald-500 flex-shrink-0" />
          <span>User {userPercent}%</span>
        </div>
        <div className="flex items-center space-x-1.5">
          <span className="w-2 h-2 rounded-full bg-sky-500 flex-shrink-0" />
          <span>Assistant {assistantPercent}%</span>
        </div>
        <div className="flex items-center space-x-1.5">
          <span className="w-2 h-2 rounded-full bg-amber-500 flex-shrink-0" />
          <span>Tool Calls {toolPercent}%</span>
        </div>
        <div className="flex items-center space-x-1.5">
          <span className="w-2 h-2 rounded-full bg-slate-400 flex-shrink-0" />
          <span>Other {otherPercent}%</span>
        </div>
      </div>
    </div>
  );
}
