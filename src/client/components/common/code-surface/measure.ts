/**
 * Wrapped-row measurement for the line-number gutter.
 *
 * The gutter is a column of one-row line numbers, which is only right while a
 * line fits on one row. With word wrap on, the editor lays a long line out over
 * several rows and every number after it would sit above its own line. How many
 * rows a line takes is a layout fact — font metrics, break opportunities, the
 * width the editor actually got — so it is measured rather than estimated: the
 * same lines are laid out once in a hidden mirror that copies the editor's
 * typography, and each line's height is read back.
 */

/**
 * The mirror has to reproduce the editor's line breaking exactly, so every
 * property that can move a break is copied from the live editor's computed
 * style instead of being restated (a second copy of the font stack would drift).
 */
const MIRRORED_PROPERTIES = [
  'direction',
  'fontFamily',
  'fontFeatureSettings',
  'fontKerning',
  'fontSize',
  'fontStyle',
  'fontVariantLigatures',
  'fontWeight',
  'letterSpacing',
  'overflowWrap',
  'tabSize',
  'textRendering',
  'textTransform',
  'whiteSpace',
  'wordBreak',
  'wordSpacing',
] as const;

export interface WrappedLines {
  /** Height in px of a single visual row. */
  rowHeight: number;
  /** Height in px each line of the source occupies once wrapped. */
  heights: number[];
}

let mirrorHost: HTMLDivElement | null = null;
let mirrorLines: HTMLDivElement[] = [];

/** Off-screen mirror, reused across measurements (one per page). */
function getMirrorHost(): HTMLDivElement {
  if (!mirrorHost || !mirrorHost.isConnected) {
    mirrorHost = document.createElement('div');
    mirrorHost.setAttribute('aria-hidden', 'true');
    mirrorHost.style.cssText =
      'position:fixed;top:0;left:-100000px;visibility:hidden;pointer-events:none;margin:0;border:0;padding:0;box-sizing:border-box;';
    document.body.appendChild(mirrorHost);
    mirrorLines = [];
  }
  return mirrorHost;
}

/**
 * Height each line of `value` occupies in `source`'s wrap layout, or null when
 * the layout is not measurable yet (SSR, zero width, unresolved line-height) —
 * callers then fall back to one row per line.
 */
export function measureWrappedLines(source: HTMLPreElement, value: string): WrappedLines | null {
  if (typeof document === 'undefined' || !source.isConnected) return null;
  const computed = getComputedStyle(source);
  const rowHeight = Number.parseFloat(computed.lineHeight);
  if (!Number.isFinite(rowHeight) || rowHeight <= 0) return null;
  // The editor's text column: its padding is the gutter's offset, not text area.
  const width =
    source.clientWidth -
    Number.parseFloat(computed.paddingLeft || '0') -
    Number.parseFloat(computed.paddingRight || '0');
  if (width <= 0) return null;

  const host = getMirrorHost();
  for (const property of MIRRORED_PROPERTIES) host.style[property] = computed[property];
  host.style.lineHeight = `${rowHeight}px`;
  host.style.width = `${width}px`;

  const lines = value.split('\n');
  while (mirrorLines.length > lines.length) mirrorLines.pop()?.remove();
  while (mirrorLines.length < lines.length) {
    const line = document.createElement('div');
    host.appendChild(line);
    mirrorLines.push(line);
  }
  // Write the whole text first, then read the whole layout: interleaving the
  // two would force a re-layout per line.
  for (let i = 0; i < lines.length; i++) mirrorLines[i].textContent = lines[i];
  const heights = mirrorLines.map((line) => {
    const height = line.getBoundingClientRect().height;
    // An empty line has no line box at all, and sub-pixel wrapping would
    // otherwise leave the gutter fractions of a row out of step.
    return height > rowHeight ? Math.round(height / rowHeight) * rowHeight : rowHeight;
  });
  return { rowHeight, heights };
}
