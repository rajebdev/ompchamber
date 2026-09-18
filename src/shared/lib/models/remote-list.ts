/**
 * Normalization of raw provider model-listing entries (/v1/models) into
 * ProviderModel shapes. Covers the field spellings seen in the wild:
 * OpenAI (data[].context_window), Gemini (models[].displayName, "models/"
 * prefixed ids), Anthropic (display_name), and Kenari (context_length,
 * modalities, tool_call, micro-IDR pricing).
 */

import { formatContextWindow } from '@/shared/lib/code/format';
import type { ProviderModel } from '@/shared/types';

export interface RemoteModelEntry {
  id?: string;
  name?: string;
  display_name?: string;
  displayName?: string;
  context_window?: number;
  contextWindow?: number;
  context_length?: number;
  contextLength?: number;
  max_output_tokens?: number;
  maxOutputTokens?: number;
  inputTokenLimit?: number;
  max_context_length?: number;
  reasoning?: boolean;
  reasoning_toggle?: boolean;
  tool_call?: boolean;
  modalities?: { input?: string[]; output?: string[] };
  pricing?: {
    input?: number;
    output?: number;
    currency?: string;
    unit?: string;
  };
}

export interface RemoteCapabilities {
  hasVision?: boolean;
  hasReasoning?: boolean;
  hasTools?: boolean;
  priceInput?: number;
  priceOutput?: number;
  maxOutputTokens?: number;
}

const MICRO_IDR_PER_USD = 16_500 * 1_000_000;

function normalizePricing(pricing: RemoteModelEntry['pricing']): { input?: number; output?: number } {
  if (!pricing || typeof pricing.input !== 'number' || typeof pricing.output !== 'number') return {};
  if (pricing.unit === 'micro_idr_per_1m_tokens') {
    return {
      input: Number((pricing.input / MICRO_IDR_PER_USD).toFixed(4)),
      output: Number((pricing.output / MICRO_IDR_PER_USD).toFixed(4)),
    };
  }
  if (pricing.currency === 'USD') return { input: pricing.input, output: pricing.output };
  return {};
}

export function entryCapabilities(entry: RemoteModelEntry): RemoteCapabilities {
  const pricing = normalizePricing(entry.pricing);
  const inputModalities = entry.modalities?.input;
  const outTokens = [entry.max_output_tokens, entry.maxOutputTokens]
    .find((v): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0);
  return {
    hasVision: inputModalities ? inputModalities.includes('image') : undefined,
    hasReasoning: entry.reasoning === true || entry.reasoning_toggle === true || undefined,
    hasTools: entry.tool_call === false ? false : entry.tool_call === true ? true : undefined,
    priceInput: pricing.input,
    priceOutput: pricing.output,
    maxOutputTokens: outTokens,
  };
}

function toProviderModel(entry: RemoteModelEntry, capabilities: RemoteCapabilities): ProviderModel | null {
  const rawId = typeof entry.id === 'string' && entry.id.trim().length > 0
    ? entry.id
    : (typeof entry.name === 'string' ? entry.name : '');
  // Gemini lists ids as "models/<id>" — strip the prefix.
  const id = rawId.replace(/^models\//, '').trim();
  if (!id) return null;
  const displayName = typeof entry.display_name === 'string' && entry.display_name.trim().length > 0
    ? entry.display_name.trim()
    : undefined;
  const geminiName = typeof entry.displayName === 'string' && entry.displayName.trim().length > 0
    ? entry.displayName.trim()
    : undefined;
  const ctx = [entry.context_window, entry.contextWindow, entry.context_length, entry.contextLength, entry.inputTokenLimit, entry.max_context_length]
    .find((value): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0);
  const out = capabilities.maxOutputTokens;
  const ctxLabel = ctx ? formatContextWindow(ctx) : null;
  const outLabel = out ? formatContextWindow(out) : null;
  const contextWindow = ctxLabel
    ? (outLabel ? `${ctxLabel} ctx · ${outLabel} out` : `${ctxLabel} ctx`)
    : '';
  return {
    id,
    name: displayName ?? geminiName ?? id,
    contextWindow,
    hasTools: capabilities.hasTools ?? true,
    hasVision: capabilities.hasVision ?? false,
    hasReasoning: capabilities.hasReasoning,
    priceInput: capabilities.priceInput,
    priceOutput: capabilities.priceOutput,
    isVisible: true,
  };
}

export function extractModels(payload: unknown): ProviderModel[] | null {
  if (!payload || typeof payload !== 'object') return null;
  const obj = payload as Record<string, unknown>;
  const list = Array.isArray(obj.data) ? obj.data : Array.isArray(obj.models) ? obj.models : null;
  if (!list) return null;
  const models: ProviderModel[] = [];
  const seen = new Set<string>();
  for (const raw of list) {
    if (!raw || typeof raw !== 'object') continue;
    const model = toProviderModel(raw as RemoteModelEntry, entryCapabilities(raw as RemoteModelEntry));
    if (model && !seen.has(model.id)) {
      seen.add(model.id);
      models.push(model);
    }
  }
  return models;
}
