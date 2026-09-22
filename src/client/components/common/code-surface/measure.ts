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
 *
 * Measuring every line on every keystroke is linear in the document, which no
 * long file can afford, so heights are cached per line *text*: an edit re-reads
 * the one line it touched, and a document whose lines all fit on one row is
 * never mirrored at all.
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

/**
 * Newest-first ceiling on the height cache. A long editing session mints one
 * entry per keystroke, so the oldest entries are dropped once it is reached;
 * whatever leaves the cache is simply measured again on the next pass.
 */
const HEIGHT_CACHE_LIMIT = 100_000;

export interface WrappedLines {
  /** Height in px of a single visual row. */
  rowHeight: number;
  /** Height in px each line of the source occupies once wrapped. */
  heights: number[];
}

let mirrorHost: HTMLDivElement | null = null;
let mirrorLines: HTMLDivElement[] = [];
/** The column the cached heights were measured in; a new one re-wraps every line. */
let mirrorSignature = '';
const heightByLine = new Map<string, number>();
/** Line indexes awaiting a mirror read this pass; reused to keep the pass allocation-free. */
const pendingLines: number[] = [];

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

/** Height in px of `source`'s line box, or null while it cannot be measured (SSR, `line-height: normal`). */
export function measureRowHeight(source: HTMLPreElement): number | null {
  if (typeof document === 'undefined' || !source.isConnected) return null;
  const rowHeight = Number.parseFloat(getComputedStyle(source).lineHeight);
  return Number.isFinite(rowHeight) && rowHeight > 0 ? rowHeight : null;
}

/**
 * Height each line of `value` occupies in `source`'s wrap layout, or null when
 * the layout is not measurable yet (SSR, zero width, unresolved line-height) —
 * callers then fall back to one row per line.
 */
export function measureWrappedLines(source: HTMLPreElement, value: string): WrappedLines | null {
  const rowHeight = measureRowHeight(source);
  if (rowHeight === null) return null;
  const computed = getComputedStyle(source);
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

  const signature = `${width}|${rowHeight}|${MIRRORED_PROPERTIES.map((property) => computed[property]).join('|')}`;
  if (signature !== mirrorSignature) {
    mirrorSignature = signature;
    heightByLine.clear();
  }

  const lines = value.split('\n');
  const heights = new Array<number>(lines.length);
  let pending = 0;
  for (let i = 0; i < lines.length; i++) {
    const cached = heightByLine.get(lines[i]);
    if (cached === undefined) pendingLines[pending++] = i;
    else heights[i] = cached;
  }

  if (pending > 0) {
    while (mirrorLines.length < pending) {
      const line = document.createElement('div');
      host.appendChild(line);
      mirrorLines.push(line);
    }
    // Write the whole batch first, then read the whole layout: interleaving the
    // two would force a re-layout per line.
    for (let k = 0; k < pending; k++) mirrorLines[k].textContent = lines[pendingLines[k]];
    for (let k = 0; k < pending; k++) {
      const index = pendingLines[k];
      const height = mirrorLines[k].getBoundingClientRect().height;
      // An empty line has no line box at all, and sub-pixel wrapping would
      // otherwise leave the gutter fractions of a row out of step.
      const rows = height > rowHeight ? Math.round(height / rowHeight) * rowHeight : rowHeight;
      heights[index] = rows;
      heightByLine.set(lines[index], rows);
    }
    if (heightByLine.size > HEIGHT_CACHE_LIMIT) {
      let drop = heightByLine.size - HEIGHT_CACHE_LIMIT / 2;
      for (const key of heightByLine.keys()) {
        if (drop-- <= 0) break;
        heightByLine.delete(key);
      }
    }
  }

  return { rowHeight, heights };
}
