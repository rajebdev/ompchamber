import type { ApprovalMode } from '@/shared/lib/omp/config/access-mode';

/** Composer labels for omp's tool-approval modes (see ApprovalMode). */
export const ACCESS_LEVEL_LABELS: Record<ApprovalMode, string> = {
  'always-ask': 'Always ask',
  write: 'Minimal',
  yolo: 'Full bypass',
};

export const ACCESS_LEVEL_DESCRIPTIONS: Record<ApprovalMode, string> = {
  'always-ask': 'Read-only tools run automatically; writes and shell commands ask first.',
  write: 'Reads and edits run automatically; shell commands ask first.',
  yolo: 'Everything runs without asking.',
};
