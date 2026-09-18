import type { ReactNode } from 'preact/compat';
import { AlertCircle, KeyRound } from 'lucide-preact';

interface ProviderCardProps {
  providerName: string;
  configured: boolean;
  error?: string;
  note?: string;
  children: ReactNode;
}

/** Provider shell: header, configured empty state, error line, and content slot.
 * Content is rendered whenever the provider is configured, so partial data
 * (e.g. quota fails but balance works) still shows the sections that succeeded. */
export function ProviderCard({ providerName, configured, error, note, children }: ProviderCardProps) {
  return (
    <section className="bg-paper border border-ink/15 rounded-lg shadow-xs">
      <header className="flex items-center justify-between gap-2 px-3.5 py-2.5 border-b border-ink/10">
        <span className="text-xs font-semibold text-ink">{providerName}</span>
        <span className="text-[10px] font-mono uppercase tracking-wider text-ink/50">
          {configured ? 'Connected' : 'Not configured'}
        </span>
      </header>

      <div className="p-3.5 space-y-4">
        {!configured ? (
          <div className="flex items-start gap-2 text-ink/60 text-xs leading-relaxed">
            <KeyRound size={14} className="shrink-0 mt-0.5 text-ink/40" />
            <p>
              Add the <span className="font-semibold text-ink">{providerName}</span> API key in Settings →
              Providers to see its balance, quota, and usage here.
            </p>
          </div>
        ) : (
          <>
            {error && (
              <p className="flex items-start gap-2 text-error text-xs leading-relaxed">
                <AlertCircle size={14} className="shrink-0 mt-0.5" />
                <span className="break-words">{error}</span>
              </p>
            )}
            {children}
          </>
        )}

        {note && (
          <p className="text-[10px] text-ink/50 leading-relaxed border-t border-ink/10 pt-2.5">{note}</p>
        )}
      </div>
    </section>
  );
}
