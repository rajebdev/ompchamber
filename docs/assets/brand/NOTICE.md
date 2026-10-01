# Badge marks

The three SVGs beside this file are the logos embedded in the README's badge row.
They are **minified single-source artifacts** — the same shape as
`src/shared/lib/fonts/` (a bare `.woff2` plus this kind of notice), so provenance
lives here rather than in the files.

shields.io resolves a named `logo=` against Simple Icons, which carries **no
Elysia or Shiki mark**, and it does not accept a remote URL for `logo=`
(verified: `logo=https://…/bun.svg` answers 200 with no icon). A base64 data URI
is therefore the only way to put these marks on a badge, which is why each is
inlined in the README URL instead of referenced.

| File | Badge | Upstream | Licence |
|---|---|---|---|
| `elysia.svg` | Elysia | https://elysiajs.com/assets/elysia.svg | MIT, © SaltyAom |
| `shiki.svg` | Shiki | https://shiki.style/logo.svg | MIT, © Pine Wu / Anthony Fu |
| `ompchamber.svg` | version | derived from `public/icon.svg` | this project's own mark |

## What was changed, and why

- **`elysia.svg`** — upstream draws a grey disc (`#333333`) with a white leaf on
  top. Both were recoloured: the disc to white, and the leaf to a hole in the
  same path via `fill-rule="evenodd"`, so the mark reads on any badge colour
  instead of only on grey. Verified on `#6f42c1` and `#cb3837`.
- **`shiki.svg`** — upstream is four shapes in `#cb7676` / `#4b9978` / `#83d0da` /
  `#e6cc78`. All four are flat white, because the badge is dark (`#3f3f46`) and
  four mid-tone colours at 14px read as noise.
- **`ompchamber.svg`** — `public/icon.svg` is a 512px app tile: a dark rounded
  card with a gradient **OMP** monogram, three window dots and a status bar. The
  mark here is the tile's own monogram, nothing more, with the gradient flattened
  to brand orange (`#f97316`) and the canvas cropped to the monogram's ink.
  Two candidates were measured and rejected at the size a badge actually renders:
  the tile **as-is** covers 10% of the box and its card is dark-on-dark against a
  dark badge (invisible), and an outline-plus-chevron mark that is not in the
  icon at all was wrong on its own terms — the badge must carry the app's mark,
  not an invented one.

Every mark is one glyph in a 14px box inside a 20px badge, so each was checked at
that size rather than at 512px: ink covers 40% (Elysia), 64% (Shiki) and 38%
(OMPChamber) of the box, against 2–10% for the first drafts, which read as
specks. GitHub renders badges at 2× on a retina screen, where the OMP letterforms
are legible; at 1× the monogram is three ~4.6px letters and reads as texture —
the honest limit of putting a wordmark on a 14px badge, and the reason the tile
(two nested frames around the same tiny wordmark) was not used.

## Regenerating

The payload in the README is `data:image/svg%2bxml;base64,<base64 of the file>`,
with `+`, `/` and `=` percent-encoded (`+` alone is decoded as a space by the
query parser, and a raw `/` ends the path). The test in
`docs/assets/brand/badges.test.ts` decodes the README URLs and fails if they stop
matching these files byte for byte, so the two cannot drift silently.

To rebuild a mark from upstream: fetch it, apply the recolouring described above
(for Elysia, also merge the disc and the leaf into one `fill-rule="evenodd"`
path; for OMPChamber, drop the tile and keep the monogram, flattening its
gradient), then minify. `svgo` is not a declared dependency — it is a one-off:

```bash
bunx svgo --multipass --precision 0 <recoloured>.svg -o docs/assets/brand/elysia.svg
```

That command is idempotent on the committed files, so re-running it is a no-op.
`--precision 0` is deliberate: it costs 0.36% of the mark's pixels at a 512px
render and 0% at 14px, and it keeps each README URL near 1 KB instead of 3 KB.

Then re-embed the payload — `bun test docs/assets/brand/badges.test.ts` fails
until you do.
