import type { ToolCallData } from '@/shared/types/chat';

/**
 * Extract a `path` string from a tool call's raw arguments, which omp sends as
 * an object but the MOCK path may send as a JSON string. Returns undefined when
 * the argument is absent or not a string.
 */
export function getToolInputPath(input: ToolCallData['input']): string | undefined {
  if (input && typeof input === 'object' && typeof input.path === 'string') return input.path;
  return undefined;
}

/** Extract a string `action` from a tool call's raw arguments (omp sends an
 *  object; the MOCK path may send a JSON string). Returns undefined otherwise. */
export function getToolInputAction(input: ToolCallData['input']): string | undefined {
  if (input && typeof input === 'object' && typeof input.action === 'string') return input.action;
  return undefined;
}
