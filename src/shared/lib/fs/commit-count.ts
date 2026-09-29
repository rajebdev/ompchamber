/**
 * The commit modal's header badge.
 *
 * Extracted from the component because the wording encodes three facts that are
 * easy to conflate and were: `total` is the BRANCH's commit count, `loaded` is
 * what git has handed over so far, and `matches` is what the search filter left
 * of it. Printing `matches` against `total` claims the filter searched the whole
 * history; printing `loaded` alone is what made a 646-commit branch read
 * "50 commits".
 */
export interface CommitCountInput {
  /** Rows currently rendered (the loaded page, or its search matches). */
  matches: number;
  /** Rows loaded from git, before the search filter. */
  loaded: number;
  /** The branch's real commit count, when the response carried it. */
  total?: number;
  hasMore?: boolean;
  isFiltering?: boolean;
}

export function formatCommitCount({ matches, loaded, total, hasMore, isFiltering }: CommitCountInput): string {
  if (isFiltering) {
    // The filter only ever sees the loaded page, so the denominator must be
    // that page — `of 646` would claim a search of the whole history.
    return `${matches} of ${loaded} loaded`;
  }
  if (typeof total === 'number' && total > 0) {
    return hasMore || loaded < total ? `${loaded} of ${total}` : `${total} commits`;
  }
  // No total from git — a branch with no commits, or a response that omitted
  // it. Say what is on screen and mark it as a partial read.
  return hasMore ? `${loaded}+ commits` : `${loaded} commits`;
}
