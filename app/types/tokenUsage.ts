export type CadenceType = 'daily' | 'weekly' | 'monthly';
export type TimeRangeType = 'today' | '7d' | '30d' | '90d' | 'all' | 'custom';
export type BreakdownTab = 'model' | 'day' | 'project';
export type ChartMetric = 'cost' | 'tokens';

export interface ChartSeriesPoint {
  label: string;
  cost: number;
  tokens: number;
}

export interface CustomRange {
  from: string;
  to: string;
}

export interface BreakdownRow {
  name: string;
  cost: string;
  share: string;
  tokens: string;
  sharePercent: number;
  dotColorClass: string;
}

export interface TimeRangeOption {
  id: TimeRangeType;
  label: string;
  dateRange: string;
}

export interface TokenUsageMetricSet {
  rawCost: string;
  processedTokens: string;
  activeRate: string;
  cachedInput: string;
  cachedPercent: string;
  uncachedInput: string;
  outputTokens: string;
  reasoning: string;
  cacheSavings: string;
  scannedTranscripts: number;
  usageRecords: number;
}
