import type { UsageWindow } from "../providers/types";

const validPercent = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100;

export function normalizePercentage(input: { usedPercent?: unknown; remainingPercent?: unknown }): Pick<UsageWindow, "usedPercent" | "remainingPercent"> {
  const used = validPercent(input.usedPercent) ? input.usedPercent : undefined;
  const remaining = validPercent(input.remainingPercent) ? input.remainingPercent : undefined;
  if (used !== undefined) return { usedPercent: used, remainingPercent: remaining ?? 100 - used };
  if (remaining !== undefined) return { usedPercent: 100 - remaining, remainingPercent: remaining };
  return {};
}

export function normalizeFraction(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) return undefined;
  return Math.round(value * 10_000) / 100;
}

export function normalizeResetAt(value: unknown): string | undefined {
  if (typeof value !== "string" && typeof value !== "number") return undefined;
  const normalized = typeof value === "number" && value > 0 && value < 1_000_000_000_000 ? value * 1000 : value;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}
