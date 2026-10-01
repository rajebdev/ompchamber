/**
 * The release range, drawn as one section per version.
 *
 * Each section is the GitHub release body for that tag — which for this project
 * IS the `CHANGELOG.md` section the release pipeline wrote — rendered through the
 * app's own markdown pipeline, so links, bold labels and commit hashes look the
 * same here as they do in a chat message. The body's own leading heading is
 * stripped (see `@/shared/lib/updates/release-body`) because this component
 * draws that heading itself, with the date and the link to the release.
 */

import type { TargetedMouseEvent } from 'preact';
import { ExternalLink } from 'lucide-preact';
import { MarkdownRenderer } from '@/client/components/common/MarkdownRenderer';
import { splitReleaseBody } from '@/shared/lib/updates/release-body';
import type { ReleaseNote, UpdateChangelog } from '@/shared/types/updates';

const LINK_CLASS = 'inline-flex items-center gap-1 text-[10px] font-medium text-ink/50 hover:text-ink transition-colors';

/**
 * A changelog body is full of links — commits, compare ranges, pull requests.
 * Without this, one click navigates the console away from the user's session;
 * a release note is a reference, so every link leaves in a new tab.
 */
function openLinksExternally(event: TargetedMouseEvent<HTMLDivElement>) {
  const link = (event.target as HTMLElement).closest<HTMLAnchorElement>('a[href]');
  if (!link) return;
  event.preventDefault();
  event.stopPropagation();
  window.open(link.href, '_blank', 'noopener,noreferrer');
}

function ReleaseSection({ note }: { note: ReleaseNote }) {
  const { date, markdown } = splitReleaseBody(note.body);
  const published = date ?? note.publishedAt?.slice(0, 10) ?? null;

  return (
    <article className="border-t border-ink/10 pt-4 first:border-t-0 first:pt-0">
      <header className="flex items-baseline justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-mono text-[13px] font-semibold text-ink">v{note.version}</h3>
          {published && <p className="font-mono text-[10px] text-ink/40">{published}</p>}
        </div>
        {note.url && (
          <a href={note.url} target="_blank" rel="noopener noreferrer" className={`${LINK_CLASS} shrink-0`}>
            <ExternalLink size={11} />
            <span>Release</span>
          </a>
        )}
      </header>
      {markdown ? (
        <MarkdownRenderer content={markdown} className="mt-2 text-[12px]" />
      ) : (
        <p className="mt-2 text-[11px] text-ink/40">This release was published without notes.</p>
      )}
    </article>
  );
}

export function ReleaseNotes({ data }: { data: UpdateChangelog }) {
  return (
    <div className="space-y-4" onClick={openLinksExternally}>
      {data.truncated && (
        <p className="flex flex-wrap items-center gap-1.5 text-[11px] text-ink/50">
          <span>
            Showing the {data.versions.length} newest of {data.total} releases since v{data.current}.
          </span>
          {data.releaseUrl && (
            <a href={data.releaseUrl} target="_blank" rel="noopener noreferrer" className={LINK_CLASS}>
              <span>Full changelog</span>
              <ExternalLink size={11} />
            </a>
          )}
        </p>
      )}
      {data.versions.map((note) => (
        <ReleaseSection key={note.tag || note.version} note={note} />
      ))}
    </div>
  );
}
