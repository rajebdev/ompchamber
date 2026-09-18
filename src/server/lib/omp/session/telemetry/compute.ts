import { formatNewSessionTitle } from '@/shared/lib/omp/session/default-title';
import { contentProfile } from '@/shared/lib/omp/session/telemetry-blocks';
import type { RawMessageItem, SessionContextTelemetry } from '@/shared/types/context';
import { CONTEXT_LIMIT, type OmpUsage, type SessionEntry } from '@/server/lib/omp/session/telemetry/types';
import { buildInfo, contextAnchorTokens, emptyTelemetry, formatCost, formatTs, textOf, tokensOf } from '@/server/lib/omp/session/telemetry/format';
import { scanSessionEntries } from '@/server/lib/omp/session/telemetry/scan';

/**
 * Compute real `SessionContextTelemetry` for a session file (all-zero on
 * unreadable/empty). `rawLimit` caps materialized raw items (0 = none): the
 * panel reads full pages from `computeRawMessagesPage` in ./telemetry-raw.ts.
 */
export function computeRealSessionTelemetry(
  filePath: string,
  sessionId: string,
  fallbackTitle?: string,
  rawLimit = 0,
): SessionContextTelemetry {
  const defaultTitle = fallbackTitle || 'New Session';

  let header: SessionEntry | undefined;
  let userCount = 0;
  let assistantCount = 0;
  let userChars = 0;
  let assistantChars = 0;
  let toolChars = 0;
  let totalCost = 0;
  let contextAnchor = 0;
  let modelProvider = '';
  let modelId = '';
  let effectiveTitle = '';
  let shortSummary = '', firstUserText = '';
  let lastAsstUsage: OmpUsage | undefined;
  let sumInput = 0;
  let sumOutput = 0;
  let sumCacheRead = 0;
  let sumCacheWrite = 0;
  // Cache-hit average only counts warmed calls — any assistant call that read
  // zero cache tokens (cold request) is excluded, not just the very first one.
  let cacheAvgInput = 0;
  let cacheAvgCacheRead = 0;
  let costInput = 0;
  let costOutput = 0;
  let costCacheRead = 0;
  let costCacheWrite = 0;
  let messagesCount = 0;
  const rawMessages: RawMessageItem[] = [];
  let cwd = '';

  scanSessionEntries(filePath, (entry, index) => {
    // Modern session files start with a fixed-width title slot line, so the
    // header is never at index 0 when one exists. A filled slot (auto/user
    // rename) outranks the header's own title field.
    if (entry.type === 'title') {
      if (typeof entry.title === 'string' && entry.title.trim()) effectiveTitle = entry.title.trim();
      return;
    }
    if (entry.type === 'session' && !header) {
      header = entry;
      cwd = entry.cwd ?? '';
      if (!effectiveTitle && typeof entry.title === 'string') effectiveTitle = entry.title;
      return;
    }
    if (entry.type === 'compaction' && typeof entry.shortSummary === 'string' && !shortSummary) shortSummary = entry.shortSummary;
    if (entry.type !== 'message' || !entry.message) return;

    const msg = entry.message;
    const role = msg.role ?? '';
    const text = textOf(msg.content);
    const profile = contentProfile(msg.content);
    const info = buildInfo(entry, msg, cwd, index);
    const tokens = tokensOf(msg.usage);

    toolChars += profile.toolChars;

    if (role === 'user') {
      userCount++;
      userChars += text.length;
      if (!firstUserText && text.trim()) firstUserText = text.trim();
    } else if (role === 'assistant') {
      assistantCount++;
      assistantChars += text.length;
      if (msg.usage) lastAsstUsage = msg.usage;
      const anchor = contextAnchorTokens(msg);
      if (anchor !== undefined) contextAnchor = anchor;
    }

    if (msg.usage) {
      totalCost += msg.usage.cost?.total ?? 0;
      sumInput += tokens.input;
      sumOutput += tokens.output;
      sumCacheRead += tokens.cacheRead;
      sumCacheWrite += tokens.cacheWrite;
      if (msg.role === 'assistant' && tokens.cacheRead > 0) {
        cacheAvgInput += tokens.input;
        cacheAvgCacheRead += tokens.cacheRead;
      }
      costInput += msg.usage.cost?.input ?? 0;
      costOutput += msg.usage.cost?.output ?? 0;
      costCacheRead += msg.usage.cost?.cacheRead ?? 0;
      costCacheWrite += msg.usage.cost?.cacheWrite ?? 0;
    }
    if (msg.provider) modelProvider = msg.provider;
    if (msg.model) modelId = msg.model;

    if (role === 'user' || role === 'assistant') {
      messagesCount++;
      if (rawLimit === 0 || rawMessages.length < rawLimit) {
        const isAssistant = role === 'assistant';
        const snippet = text.slice(0, 70);
        rawMessages.push({
          id: entry.id ?? `m${index}`,
          type: isAssistant ? (profile.parts.length ? profile.parts.join('_') : 'text') : 'user',
          badgeLabel: isAssistant
            ? (profile.parts.length ? profile.parts.join(' + ') : 'text')
            : `user: ${snippet}${text.length > 70 ? '...' : ''}`,
          tokenSummary: isAssistant
            ? `${tokens.input.toLocaleString()} / ${tokens.output.toLocaleString()}`
            : '',
          timestamp: formatTs(entry.timestamp),
          info,
          rawPayload: entry as unknown as Record<string, any>,
        });
      }
    }
  });

  if (messagesCount === 0 && !header && !effectiveTitle) return emptyTelemetry(sessionId, defaultTitle);

  const providerModel = modelProvider && modelId ? `${modelProvider}/${modelId}` : '';
  const contextUsed = contextAnchor;
  const contextPercent = Math.min(100, Math.max(0, Number(((contextUsed / CONTEXT_LIMIT) * 100).toFixed(1))));

  // Distribution: real token categories (input→user, output→assistant, cacheWrite→tool, cacheRead→other); char fallback when no usage.
  const hasUsage = sumInput + sumOutput + sumCacheRead + sumCacheWrite > 0;
  const userTokens = hasUsage ? sumInput : userChars;
  const assistantTokens = hasUsage ? sumOutput : assistantChars;
  const toolTokens = hasUsage ? sumCacheWrite : toolChars;
  const otherTokens = hasUsage ? sumCacheRead : 0;
  const grand = Math.max(1, userTokens + assistantTokens + toolTokens + otherTokens);
  const userPercent = Math.max(0, Math.round((userTokens / grand) * 100));
  const assistantPercent = Math.max(0, Math.round((assistantTokens / grand) * 100));
  const toolPercent = Math.max(0, Math.round((toolTokens / grand) * 100));
  const otherPercent = Math.max(0, 100 - userPercent - assistantPercent - toolPercent);

  const lastTokens = tokensOf(lastAsstUsage);
  const cacheHitPercent = lastAsstUsage && lastTokens.input + lastTokens.output + lastTokens.cacheRead > 0 ? Number(((lastTokens.cacheRead / (lastTokens.input + lastTokens.output + lastTokens.cacheRead)) * 100).toFixed(1)) : 0;
  const cacheHitAverage = cacheAvgInput + cacheAvgCacheRead > 0 ? Number(((cacheAvgCacheRead / (cacheAvgInput + cacheAvgCacheRead)) * 100).toFixed(1)) : 0;

  return {
    sessionId,
    sessionTitle: effectiveTitle || shortSummary || firstUserText
      || (header?.timestamp ? formatNewSessionTitle(new Date(header.timestamp)) : defaultTitle),
    modelId: providerModel,
    modelName: providerModel,
    timestamp: formatTs(header?.timestamp),
    contextUsed,
    contextLimit: CONTEXT_LIMIT,
    contextPercent,
    messagesCount,
    userCount,
    assistantCount,
    totalCost,
    costFormatted: formatCost(totalCost),
    cacheHitAverage,
    costBreakdown: { input: costInput, output: costOutput, cacheRead: costCacheRead, cacheWrite: costCacheWrite, total: totalCost },
    lastMessage: {
      input: lastTokens.input,
      output: lastTokens.output,
      reasoning: lastTokens.reasoning,
      cacheRead: lastTokens.cacheRead,
      cacheWrite: lastTokens.cacheWrite,
      cacheHitPercent,
    },
    distribution: {
      userTokens,
      userPercent,
      assistantTokens,
      assistantPercent,
      toolTokens,
      toolPercent,
      otherTokens,
      otherPercent,
    },
    // Held to `rawLimit` items — the panel pages via computeRawMessagesPage.
    rawMessages,
  };
}
