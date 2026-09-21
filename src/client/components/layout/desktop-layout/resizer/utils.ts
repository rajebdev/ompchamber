/**
 * Pure geometry for the resizable panel group: the clamping, the px parsing
 * and the pixel transfer between a dragged pair. Kept out of `index.tsx` so
 * the components stay inside the repo's file-size ceiling.
 */

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function toPx(value: number | string | undefined, fallback: number): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return parseFloat(value) || fallback;
  return fallback;
}

/**
 * Pixels transferred between the dragged pair. Positive delta moves the
 * separator right/down: A grows, B shrinks. The applied delta is clamped so
 * neither panel crosses its own min/max.
 *
 * A shrinking is bounded by A's floor and B's *ceiling* — B is the panel that
 * grows on that side. Bounding it by B's floor instead is what made a
 * separator dead as soon as its neighbour sat at its minimum.
 */
export function transfer(
  a: { size: number; min: number; max: number },
  b: { size: number; min: number; max: number },
  delta: number,
): number {
  const lower = Math.max(a.min - a.size, b.size - b.max);
  const upper = Math.min(a.max - a.size, b.size - b.min);
  return clamp(delta, lower, upper);
}
