import { normalizePercentage, normalizeResetAt } from "../../usage/normalization";
import type { ProviderUsage, UsageWindow } from "../types";

type JsonObject = Record<string, unknown>;
function asObject(value: unknown): JsonObject | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : undefined;
}

function durationLabel(seconds: unknown, fallback: string, freePlan: boolean): string {
  if (typeof seconds !== "number" || !Number.isFinite(seconds)) return fallback;
  if (seconds === 18_000) return "5-hour limit";
  if (seconds === 86_400) return "Daily";
  if (seconds === 604_800) return "Weekly limit";
  if (seconds >= 2_419_200 && seconds <= 2_678_400) return freePlan ? "Monthly free limits" : "Monthly limit";
  if (seconds >= 31_449_600 && seconds <= 31_622_400) return "Annual";
  if (seconds % 86_400 === 0) return `${seconds / 86_400}-day`;
  if (seconds % 3_600 === 0) return `${seconds / 3_600}-hour`;
  return fallback;
}

function parseWindow(raw: unknown, id: string, fallbackLabel: string, freePlan: boolean, prefix?: string): UsageWindow | undefined {
  const value = asObject(raw);
  if (!value) return undefined;
  const percent = normalizePercentage({ usedPercent: value.used_percent });
  if (percent.usedPercent === undefined) return undefined;
  const label = `${prefix ? `${prefix} · ` : ""}${durationLabel(value.limit_window_seconds, fallbackLabel, freePlan)}`;
  const resetAt = normalizeResetAt(value.reset_at);
  return { id, label, ...percent, ...(resetAt ? { resetAt } : {}), ...(prefix ? { model: prefix } : {}) };
}

function appendRateLimit(windows: UsageWindow[], raw: unknown, idPrefix: string, freePlan: boolean, labelPrefix?: string): void {
  const rateLimit = asObject(raw);
  if (!rateLimit) return;
  const primary = parseWindow(rateLimit.primary_window, `${idPrefix}-primary`, "Primary", freePlan, labelPrefix);
  const secondary = parseWindow(rateLimit.secondary_window, `${idPrefix}-secondary`, "Secondary", freePlan, labelPrefix);
  if (primary) windows.push(primary);
  if (secondary) windows.push(secondary);
}

export function parseChatGptUsage(raw: unknown, fetchedAt = new Date().toISOString()): ProviderUsage | null {
  const usage = asObject(raw);
  if (!usage) return null;
  const rawPlan = typeof usage.plan_type === "string" && usage.plan_type.length <= 100 ? usage.plan_type : undefined;
  const freePlan = rawPlan ? /(?:^|[_-])free(?:$|[_-])/i.test(rawPlan) : false;
  let windows: UsageWindow[] = [];
  appendRateLimit(windows, usage.rate_limit, "general", freePlan);
  if (freePlan) {
    const monthly = windows.filter((window) => window.label === "Monthly free limits");
    if (monthly.length) windows = monthly;
  }
  if (!windows.length) return null;
  const plan = rawPlan
    ? ({ free: "ChatGPT Free", plus: "ChatGPT Plus", pro: "ChatGPT Pro", team: "ChatGPT Team", enterprise: "ChatGPT Enterprise" } as Record<string, string>)[rawPlan.toLowerCase()]
      ?? rawPlan.split(/[_-]+/).map((part) => part ? part[0]!.toUpperCase() + part.slice(1) : part).join(" ")
    : undefined;
  return {
    provider: "chatgpt",
    windows,
    fetchedAt: normalizeResetAt(fetchedAt) ?? new Date().toISOString(),
    source: "internal-api",
    ...(plan ? { plan } : {})
  };
}
