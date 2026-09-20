export const MODEL_COLORS = [
  'bg-emerald-500',
  'bg-sky-500',
  'bg-amber-500',
  'bg-violet-500',
  'bg-rose-500',
  'bg-teal-500',
  'bg-indigo-500',
  'bg-fuchsia-500',
  'bg-lime-500',
  'bg-cyan-500',
  'bg-orange-500',
  'bg-pink-500',
  'bg-yellow-500',
  'bg-purple-500',
  'bg-red-500',
  'bg-blue-500',
  'bg-green-500',
  'bg-cyan-600',
  'bg-violet-600',
  'bg-amber-600',
];

export const PAGE_SIZE = 20;

export function hashModel(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function modelLabel(id: string): string {
  const slash = id.indexOf('/');
  const provider = slash > 0 ? id.slice(0, slash) : id;
  const model = slash > 0 ? id.slice(slash + 1) : '';
  return model ? `${provider} · ${model}` : provider;
}

/** Condensed page list: 1 … around-current … last, with ellipsis gaps. */
export function pageWindow(current: number, total: number): (number | '…')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages = new Set<number>([1, total, current, current - 1, current + 1]);
  if (current <= 3) [2, 3, 4].forEach(p => pages.add(p));
  if (current >= total - 2) [total - 3, total - 2, total - 1].forEach(p => pages.add(p));
  const sorted = [...pages].filter(p => p >= 1 && p <= total).sort((a, b) => a - b);
  const out: (number | '…')[] = [];
  let prev = 0;
  for (const p of sorted) {
    if (p - prev > 1) out.push('…');
    out.push(p);
    prev = p;
  }
  return out;
}
