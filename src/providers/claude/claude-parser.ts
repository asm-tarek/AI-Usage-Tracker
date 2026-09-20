import { normalizePercentage, normalizeResetAt } from "../../usage/normalization";
import type { ProviderUsage, UsageWindow } from "../types";

type JsonObject = Record<string, unknown>;
const WINDOWS: Record<string, { label: string; shortLabel: string }> = {
  five_hour: { label: "Current session", shortLabel: "cs" },
  // Claude names this limit "All models" or "This week" depending on the
  // account's Usage page layout, while the data is identical. "Weekly limit"
  // is accurate for every account.
  seven_day: { label: "Weekly limit", shortLabel: "wk" }
};

// Internal rollout codenames that Claude's Usage page doesn't show.
const HIDDEN_WEEKLY_KEYS = new Set(["seven_day_nimbus", "seven_day_quill"]);
const MODEL_NAMES: Record<string, string> = { opus: "Opus", sonnet: "Sonnet", haiku: "Haiku" };

const PLAN_LABELS: Record<string, string> = {
  default_claude_ai: "Claude Pro",
  pro: "Claude Pro",
  claude_pro: "Claude Pro",
  max: "Claude Max",
  max_5x: "Claude Max 5×",
  max_20x: "Claude Max 20×",
  team: "Claude Team",
  enterprise: "Claude Enterprise",
  free: "Claude Free"
};

function asObject(value: unknown): JsonObject | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : undefined;
}

function safeText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 && value.length <= 100 ? value.trim() : undefined;
}

function normalizePlan(value: unknown): string | undefined {
  const plan = safeText(value);
  if (!plan) return undefined;
  return PLAN_LABELS[plan.toLowerCase()] ?? plan.split(/[_-]+/).map((part) => part ? part[0]!.toUpperCase() + part.slice(1) : part).join(" ");
}

function planFrom(organization: unknown, usage: JsonObject): string | undefined {
  const org = asObject(organization);
  const value = usage.plan_name ?? usage.subscription_plan ?? usage.subscription_type ?? usage.subscription_tier
    ?? org?.plan_name ?? org?.subscription_plan ?? org?.subscription_type ?? org?.subscription_tier
    ?? org?.rate_limit_tier;
  return normalizePlan(value);
}

/** Two-letter pill label for an extra weekly window, lowercase like ChatGPT's labels: "wk" for a general weekly limit, otherwise the name's first two letters ("Opus" → "op"). */
function compactName(name: string): string {
  const letters = name.replace(/weekly|limit|only/gi, "").replace(/[^A-Za-z]/g, "");
  return letters.length >= 2 ? letters.slice(0, 2).toLowerCase() : "wk";
}

/** Names an extra weekly window: Claude's own display name when given, otherwise from its key. */
function weeklyDefinition(key: string, window: JsonObject): { label: string; shortLabel: string } {
  const displayName = safeText(window.display_name) ?? safeText(window.model_name);
  if (displayName) {
    const name = displayName.replace(/^weekly\s*[·:\-–]\s*/i, "").trim() || displayName;
    return { label: name, shortLabel: compactName(name) };
  }
  const suffix = key.replace(/^seven_day_/, "");
  const name = MODEL_NAMES[suffix] ?? suffix.split("_").filter(Boolean).map((part) => part[0]!.toUpperCase() + part.slice(1)).join(" ");
  return { label: name, shortLabel: compactName(name) };
}

export function parseClaudeUsage(rawUsage: unknown, organization: unknown, fetchedAt = new Date().toISOString()): ProviderUsage | null {
  const usage = asObject(rawUsage);
  if (!usage) return null;
  const windows: UsageWindow[] = [];
  const extraWeeklyKeys = Object.keys(usage)
    // Response order, which follows Claude's own ordering.
    .filter((key) => /^seven_day_[a-z0-9_]+$/.test(key) && !HIDDEN_WEEKLY_KEYS.has(key));
  for (const key of ["five_hour", "seven_day", ...extraWeeklyKeys]) {
    const rawWindow = usage[key];
    const candidate = asObject(rawWindow);
    if (!candidate || typeof candidate.utilization !== "number") continue;
    const definition = WINDOWS[key] ?? weeklyDefinition(key, candidate);
    const percentage = normalizePercentage({ usedPercent: candidate.utilization });
    if (percentage.usedPercent === undefined) continue;
    const resetAt = normalizeResetAt(candidate.resets_at ?? candidate.reset_at);
    // Claude can leave behind a numeric seven-day value while its own Usage UI
    // considers that window unavailable. An active weekly window always needs
    // both the percentage and its reset timestamp.
    // Additional weekly limits (for example a model-specific weekly cap) follow
    // the same rule, which is how they appear only once Claude's own Usage page
    // shows them.
    if (key !== "five_hour" && !resetAt) continue;
    windows.push({
      id: key,
      label: definition.label,
      shortLabel: definition.shortLabel,
      ...percentage,
      ...(resetAt ? { resetAt } : {})
    });
  }
  if (!windows.length) return null;
  const plan = planFrom(organization, usage);
  return {
    provider: "claude",
    windows,
    fetchedAt: normalizeResetAt(fetchedAt) ?? new Date().toISOString(),
    source: "internal-api",
    ...(plan ? { plan } : {})
  };
}
