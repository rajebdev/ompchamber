/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Single source of truth for Prism grammar registration.
 *
 * This module exists so the grammar import order lives in exactly ONE place.
 * Previously `syntax-highlight.ts` and `markdown/marked.ts` each duplicated the
 * same 32-import block; adding a grammar to one and forgetting the other left
 * the other consumer silently un-highlighted.
 *
 * Dependency rules (violating one breaks highlighting WITHOUT an error):
 *   - `clike` before `javascript`, `java`, `c`, `cpp`, `csharp`
 *   - `markup` before `markup-templating`, `jsx`, `tsx`
 *   - `markup-templating` before `php` (MANDATORY: `prism-php` throws without it)
 *   - `javascript` before `js-extras`, `jsx`
 *   - `markdown` before `graphql`
 *   - `jsx`/`tsx` stay LAST
 *
 * `prism-php` requires `prism-markup-templating`; omitting it makes
 * `Prism.highlight` throw, and `highlightCode`'s try/catch silently swallows
 * that into un-highlighted plain text.
 *
 * This is a real side-effect module (not a re-export barrel), so it has no
 * exports by design.
 */

import 'prismjs/components/prism-clike';
import 'prismjs/components/prism-markup';
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-typescript';
import 'prismjs/components/prism-css';
import 'prismjs/components/prism-json';
import 'prismjs/components/prism-markdown';
import 'prismjs/components/prism-bash';
import 'prismjs/components/prism-diff';
import 'prismjs/components/prism-yaml';
import 'prismjs/components/prism-python';
import 'prismjs/components/prism-go';
import 'prismjs/components/prism-rust';
import 'prismjs/components/prism-sql';
import 'prismjs/components/prism-toml';
import 'prismjs/components/prism-java';
import 'prismjs/components/prism-c';
import 'prismjs/components/prism-cpp';
import 'prismjs/components/prism-csharp';
import 'prismjs/components/prism-ruby';
import 'prismjs/components/prism-markup-templating';
import 'prismjs/components/prism-php';
import 'prismjs/components/prism-kotlin';
import 'prismjs/components/prism-swift';
import 'prismjs/components/prism-scala';
import 'prismjs/components/prism-lua';
import 'prismjs/components/prism-perl';
import 'prismjs/components/prism-docker';
import 'prismjs/components/prism-ini';
import 'prismjs/components/prism-properties';
import 'prismjs/components/prism-jsx';
import 'prismjs/components/prism-tsx';

// Trending / modern languages — appended after the existing set above.
import 'prismjs/components/prism-zig';
import 'prismjs/components/prism-elixir';
import 'prismjs/components/prism-dart';
import 'prismjs/components/prism-ocaml';
import 'prismjs/components/prism-haskell';
import 'prismjs/components/prism-nix';
import 'prismjs/components/prism-hcl';
import 'prismjs/components/prism-graphql';
import 'prismjs/components/prism-solidity';
import 'prismjs/components/prism-r';
import 'prismjs/components/prism-julia';
import 'prismjs/components/prism-erlang';
import 'prismjs/components/prism-clojure';
import 'prismjs/components/prism-scheme';
import 'prismjs/components/prism-racket';
import 'prismjs/components/prism-protobuf';
import 'prismjs/components/prism-makefile';
import 'prismjs/components/prism-powershell';
import 'prismjs/components/prism-json5';
import 'prismjs/components/prism-less';
import 'prismjs/components/prism-scss';
import 'prismjs/components/prism-sass';
import 'prismjs/components/prism-stylus';
import 'prismjs/components/prism-objectivec';
import 'prismjs/components/prism-groovy';
import 'prismjs/components/prism-js-extras';
