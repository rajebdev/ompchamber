/**
 * Type declaration for `@ompchamber/ui/styles.css`.
 *
 * TypeScript will not accept a side-effect import of a `.css` file without a
 * declaration beside it, and the error (`TS2882: Cannot find module or type
 * declarations for side-effect import`) is the first thing a plugin author would
 * hit. This is the shape TypeScript looks for — `styles.css` resolves to
 * `styles.d.css.ts` — and it requires `allowArbitraryExtensions: true` in the
 * consumer's tsconfig, which the plugin tsconfig in the docs sets.
 *
 * It is exported rather than ambient so the file is a module, which is what
 * `allowArbitraryExtensions` expects; the stylesheet itself is the payload, and
 * nothing is imported from here at runtime.
 */

export {};
