/**
 * The "What's new" range: every OMPChamber release between the version installed
 * on disk and the newest published one, newest first, ready to render.
 *
 * The range is the whole point of the popup. A user three releases behind must
 * see three sections, not just the newest one — and the sections are the release
 * bodies GitHub serves, which for this repository are the `CHANGELOG.md`
 * sections `release.config.mjs` wrote for each tag. Nothing here re-parses the
 * changelog file or trusts a client-supplied `from`/`to`: the installed version
 * is read from disk and the newest one from GitHub, so a caller cannot ask for a
 * range the install does not actually have.
 *
 * Two caps bound the response, because `omp`-style repositories can publish
 * dozens of releases and one of them (measured on a sibling project) carries a
 * 43 KB body. The NEWEST releases are always kept; the trim takes the oldest,
 * which is what "showing 12 of 29" means.
 */

import { isMockMode } from '@/server/mock.server';
import { fetchReleases, RELEASE_LIST_LIMIT, type GitHubRelease } from '@/server/lib/updates/github';
import { isManualMethod, manualUpdateCommand } from '@/server/lib/updates/install-method';
import { resolveInstallContext, resolveOmpChamberVersion } from '@/server/lib/updates/install';
import { compareVersions, isNewer, normalizeVersion } from '@/shared/lib/updates/semver';
import type { ReleaseNote, UpdateChangelog, UpdateInstallInfo } from '@/shared/types/updates';

/** Most release sections the popup will render. */
export const MAX_VERSIONS = 20;
/** Byte budget for the joined bodies; the oldest sections go first. */
export const MAX_NOTES_BYTES = 120_000;

/** Releases above `current` and up to `latest`, newest first. */
export function selectReleaseRange(releases: GitHubRelease[], current: string | null, latest: string | null): GitHubRelease[] {
  if (!latest) return [];
  return releases
    .filter((release) => {
      const version = normalizeVersion(release.tag);
      if (!version || isNewer(version, latest)) return false;
      // With no readable installed version there is nothing to be "above", so
      // the range is the newest release alone rather than the whole history.
      return current ? isNewer(version, current) : version === normalizeVersion(latest);
    })
    .sort((a, b) => compareVersions(normalizeVersion(b.tag), normalizeVersion(a.tag)));
}

function toReleaseNote(release: GitHubRelease): ReleaseNote {
  const version = normalizeVersion(release.tag);
  return {
    version,
    tag: release.tag,
    name: release.name,
    url: release.url,
    publishedAt: release.publishedAt,
    body: release.body,
  };
}

/**
 * Apply both caps, keeping the newest sections. `truncated` is what lets the
 * popup say "showing 12 of 29" instead of silently dropping the oldest releases.
 */
export function capReleaseNotes(notes: ReleaseNote[]): { versions: ReleaseNote[]; truncated: boolean } {
  const versions = notes.slice(0, MAX_VERSIONS);
  let truncated = versions.length < notes.length;

  let bytes = versions.reduce((total, note) => total + note.body.length, 0);
  while (versions.length > 1 && bytes > MAX_NOTES_BYTES) {
    bytes -= versions[versions.length - 1]!.body.length;
    versions.pop();
    truncated = true;
  }

  return { versions, truncated };
}

function resolveInstall(latest: string | null): UpdateInstallInfo {
  const context = resolveInstallContext();
  return {
    method: context.method,
    reason: context.reason,
    manual: isManualMethod(context.method),
    command: manualUpdateCommand(context.method, latest),
  };
}

/** The demo range: every render shape the popup has, without a network read. */
function mockChangelog(): UpdateChangelog {
  const note = (version: string, publishedAt: string, body: string): ReleaseNote => ({
    version,
    tag: `v${version}`,
    name: `v${version}`,
    url: `https://github.com/rajebdev/ompchamber/releases/tag/v${version}`,
    publishedAt,
    body,
  });

  return {
    current: '3.6.0',
    latest: '3.8.0',
    versions: [
      note('3.8.0', '2026-09-29T00:00:00Z', '### Added\n\n* **wiki:** add a right-panel wiki reader for GitHub and GitLab wikis\n* **wiki:** move the Wiki view beside Source Control in both bars\n\n### Fixed\n\n* **skills:** load newly created skills into live sessions\n'),
      note('3.7.1', '2026-09-29T00:00:00Z', '### Fixed\n\n* **about:** point social links at the real project and refresh the row set\n'),
      note('3.7.0', '2026-09-29T00:00:00Z', '### Added\n\n* **auth:** add opt-in UI password protection with TLS and session revocation\n* **sidebar:** keep the desktop session and folder actions on screen\n\n### Fixed\n\n* **git:** make the Source Control dot follow the repo the panel is on\n'),
    ],
    total: 3,
    truncated: false,
    releaseUrl: 'https://github.com/rajebdev/ompchamber/releases/tag/v3.8.0',
    // Only the release RANGE is faked. How this copy updates itself is a fact
    // about the running install, and a mock that invented it would show a
    // button the real apply path refuses.
    install: resolveInstall('3.8.0'),
    error: null,
  };
}

/**
 * Build the popup's payload. Never throws: every failure is a field, because the
 * popup is opened from a version check that already succeeded and an exception
 * here would surface as an empty dialog with no explanation.
 */
export async function buildUpdateChangelog(): Promise<UpdateChangelog> {
  if (isMockMode()) return mockChangelog();

  const { current, latest, release, error } = await resolveOmpChamberVersion();
  const install = resolveInstall(latest);
  const base = {
    current,
    latest,
    versions: [] as ReleaseNote[],
    total: 0,
    truncated: false,
    releaseUrl: release?.url ?? null,
    install,
  };

  if (!latest) return { ...base, error: error ?? 'No OMPChamber release could be resolved' };
  if (!current) return { ...base, error: 'The installed OMPChamber version could not be read' };
  // Nothing to announce. The client only opens the popup when a check reported an
  // update, so this is the race where the install moved between the two reads.
  if (!isNewer(latest, current)) return { ...base, error: null };

  const releases = await fetchReleases({ limit: RELEASE_LIST_LIMIT });
  const range = selectReleaseRange(releases, current, latest);
  // The installed version is not always IN the list — a dev build, a version
  // published before this page, or a local edit — and an empty range with a
  // known `latest` would otherwise render nothing. Fall back to the newest
  // release's own notes, which is what the user is being offered.
  const selected = range.length > 0 ? range : releases.filter((entry) => normalizeVersion(entry.tag) === normalizeVersion(latest));

  const { versions, truncated } = capReleaseNotes(selected.map(toReleaseNote));
  return {
    ...base,
    versions,
    total: selected.length,
    truncated,
    error: versions.length === 0 ? 'Release notes could not be fetched' : null,
  };
}
