/**
 * The version-bump contract, in one place.
 *
 * `release.config.mjs` hands these values to two different plugins and
 * `release/bump.test.js` asserts them, so a rule can only ever exist here —
 * a second copy is how the changelog and the version start disagreeing.
 *
 * Two defaults of the pinned toolchain are wrong for this repository, and both
 * are corrected below rather than by convention:
 *
 * 1. `conventional-commits-parser` compiles `noteKeywords` into
 *    `/^[\s|*]*(BREAKING CHANGE|BREAKING-CHANGE)[:\s]+(.*)/i` — the `i` flag
 *    makes ANY prose that starts a line with `breaking change` (or the
 *    hyphenated spelling, with or without the colon) a breaking note. Measured:
 *    `docs: add conventional commit type selection rules to AGENTS.md`, whose
 *    body wraps onto `breaking-change (!) footer plus the mixed-change split
 *    rule.`, was read as a breaking change and cut v1.0.0 where the `feat`s in
 *    the range only asked for v0.9.0 — and the changelog printed the prose as
 *    the breaking note. `notesPattern` replaces the built-in regex with the
 *    same shape and no `i`, so the footer has to be written in the documented
 *    uppercase to count.
 *
 * 2. `@semantic-release/commit-analyzer`'s built-in rules are evaluated as a
 *    fallback for every commit a configured rule does not match, and the first
 *    of them is `{ breaking: true, release: "major" }` — which knows nothing
 *    about types. A `!` on a type that cannot carry a breaking change
 *    (`chore!`, `docs!`, `ci!`, an unknown `foo!`) therefore released a major
 *    version, and a `BREAKING CHANGE:` footer on a chore did the same. Those
 *    fallbacks can be shadowed but not removed, so every type this repository
 *    uses — including `feature`, which the changelog lists as an alias for
 *    `feat` — gets a rule of its own and no commit is left to them.
 *
 * `release: false` is what keeps a type out of the release: it matches without
 * raising a version. It cannot keep the type out of the CHANGELOG when the
 * commit carries a breaking note, because the notes generator prints breaking
 * notes for every type by design — `commitTypes` in `release.config.mjs` is
 * what hides a type's own section, and a hidden type is never a release either.
 */

/**
 * The two spellings of a breaking-change footer. Uppercase only: the pattern
 * below is case-sensitive on purpose, so prose that merely mentions the phrase
 * is not a footer.
 */
export const noteKeywords = ['BREAKING CHANGE', 'BREAKING-CHANGE'];

/**
 * The parser's own note pattern without its `i` flag.
 *
 * `conventional-commits-parser` accepts a `notesPattern` factory instead of a
 * keyword list and calls it with the keywords already escaped and joined, so
 * this is the pinned regex verbatim apart from the flag.
 *
 * @param {String} keywords The parser's escaped, alternation-joined keywords.
 * @returns {RegExp} The note pattern, matched case-sensitively.
 */
export const notesPattern = (keywords) => new RegExp(`^[\\s|*]*(${keywords})[:\\s]+(.*)`);

/** Parser options shared by the commit analyzer and the notes generator. */
export const parserOpts = { noteKeywords, notesPattern };

/**
 * What each type does to the version.
 *
 * Order matters — the analyzer takes the highest release any matching rule
 * asks for, and evaluates every rule — but the pairs below are written so the
 * reading is top to bottom: a type that may carry a breaking change declares it
 * first, then its ordinary level, then the types that never release.
 *
 * `breaking: true` matches only a commit the parser gave a breaking note, which
 * is where a `!` header lands as well.
 */
export const releaseRules = [
  { type: 'feat', breaking: true, release: 'major' },
  { type: 'feature', breaking: true, release: 'major' },
  { type: 'fix', breaking: true, release: 'major' },
  { type: 'perf', breaking: true, release: 'major' },
  { type: 'refactor', breaking: true, release: 'major' },
  { type: 'feat', release: 'minor' },
  { type: 'feature', release: 'minor' },
  { type: 'fix', release: 'patch' },
  { type: 'perf', release: 'patch' },
  { type: 'revert', release: 'patch' },
  { type: 'chore', release: false },
  { type: 'docs', release: false },
  { type: 'style', release: false },
  { type: 'test', release: false },
  { type: 'build', release: false },
  { type: 'ci', release: false },
];
