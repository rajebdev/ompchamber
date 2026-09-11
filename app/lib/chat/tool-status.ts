import type { ToolCallData } from '@/types';

/**
 * Checks if a tool call was skipped, aborted, or synthetic (not actually executed).
 * Skipped tools should not auto-expand or trigger error-state highlights.
 */
export function isSkippedTool(tool: ToolCallData): boolean {
  if (tool.synthetic === true || tool.status === 'skipped' || tool.status === 'aborted') {
    return true;
  }
  const details = tool.details as Record<string, any> | undefined;
  if (
    details?.__synthetic === true ||
    details?.source === 'assistant_stop_skipped' ||
    details?.executed === false
  ) {
    return true;
  }
  return false;
}
