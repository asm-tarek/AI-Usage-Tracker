export type ProviderId = "chatgpt" | "claude";
export type UsageSource = "official-api" | "internal-api" | "page-state" | "dom" | "cache" | "estimated";

export interface UsageWindow {
  id: string;
  label: string;
  /** Compact name for the pill (for example "Session"). Derived from the label when absent. */
  shortLabel?: string;
  usedPercent?: number;
  remainingPercent?: number;
  resetAt?: string;
  model?: string;
  description?: string;
}

export interface ProviderUsage {
  provider: ProviderId;
  plan?: string;
  windows: UsageWindow[];
  fetchedAt: string;
  source: UsageSource;
  stale?: boolean;
}

export type UsageErrorCode =
  | "NOT_LOGGED_IN" | "USAGE_ENDPOINT_NOT_FOUND" | "RESPONSE_FORMAT_CHANGED"
  | "NETWORK_ERROR" | "PERMISSION_ERROR" | "PARSE_ERROR" | "RATE_LIMITED"
  | "UNSUPPORTED_ACCOUNT" | "UNKNOWN";

export class UsageError extends Error {
  constructor(public readonly code: UsageErrorCode, message: string, public override readonly cause?: unknown) {
    super(message);
    this.name = "UsageError";
  }
}

export interface StrategyContext { provider: ProviderId; location: Location }
export interface UsageStrategy {
  readonly name: string;
  isAvailable(context: StrategyContext): Promise<boolean>;
  fetch(context: StrategyContext): Promise<ProviderUsage | null>;
}
export interface UsageProvider {
  readonly id: ProviderId;
  matches(location: Location): boolean;
  getUsage(): Promise<ProviderUsage>;
  refreshUsage(): Promise<ProviderUsage>;
}
