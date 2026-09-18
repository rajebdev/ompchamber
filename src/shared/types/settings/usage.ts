/**
 * Usage / balance contracts for the Settings → Usage panel.
 *
 * Served by `GET /api/settings/usage`. Both provider reports are always
 * present; `configured` is false when the matching provider key is missing
 * from Settings → Providers, and `error` carries a human-readable failure
 * when the upstream call could not be completed.
 */

/** Fields shared by every provider report. */
export interface UsageProviderStatus {
  configured: boolean;
  error?: string;
}

/** A single rolling quota window from kenari's plan (week / month / 5 hours). */
export interface KenariQuotaWindow {
  key: 'five_hour' | 'week' | 'month';
  label: string;
  usedRp: number;
  remainingRp: number;
  /** RFC 3339 UTC timestamp of the next roll. */
  resetsAt: string;
}

/** An active kenari coupon, shown separately from the plan windows. */
export interface KenariCoupon {
  name: string;
  usedRp: number;
  /** Null when the coupon has no spending limit. */
  remainingRp: number | null;
  expiresAt: string;
  scopeModels: string[];
}

/** kenari plan + coupon quota (`GET /v1/account/quota`). */
export interface KenariQuota {
  planName: string | null;
  windows: KenariQuotaWindow[];
  coupon: KenariCoupon | null;
}

/** One model row from the kenari 30-day usage report. */
export interface KenariUsageRow {
  model: string;
  requests: number;
  inputTokens: number;
  outputTokens: number;
  costRp: number;
}

/** kenari 30-day usage per model (`kenari_usage` MCP tool). */
export interface KenariUsage {
  rows: KenariUsageRow[];
  totalRequests: number;
  totalCostRp: number;
  /** Raw text returned by the MCP tool, kept for display fallbacks. */
  raw: string;
}

/** kenari wallet balance (`kenari_balance` MCP tool). */
export interface KenariBalance {
  /** Parsed Rupiah amount, or null when the text could not be parsed. */
  amountRp: number | null;
  /** Raw text returned by the MCP tool. */
  raw: string;
}

export interface KenariUsageReport extends UsageProviderStatus {
  balance?: KenariBalance;
  usage?: KenariUsage;
  quota?: KenariQuota;
}

/** One currency bucket from DeepSeek's balance response. */
export interface DeepSeekBalanceEntry {
  currency: string;
  totalBalance: string;
  grantedBalance: string;
  toppedUpBalance: string;
}

/** DeepSeek prepaid balance (`GET https://api.deepseek.com/user/balance`). */
export interface DeepSeekBalance {
  isAvailable: boolean;
  entries: DeepSeekBalanceEntry[];
}

export interface DeepSeekUsageReport extends UsageProviderStatus {
  balance?: DeepSeekBalance;
}

/** Response body of `GET /api/settings/usage`. */
export interface UsageReport {
  isMock: boolean;
  generatedAt: string;
  kenari: KenariUsageReport;
  deepseek: DeepSeekUsageReport;
}
