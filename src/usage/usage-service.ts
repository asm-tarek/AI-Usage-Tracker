import type { ProviderId, ProviderUsage } from "../providers/types";
import type { UsageProvider } from "../providers/types";
import { getCachedUsage, isCacheFresh, readSettings, setCachedUsage } from "../storage/storage";

const refreshes = new Map<ProviderId, Promise<ProviderUsage>>();
let lastAttempt = new Map<ProviderId, number>();
const MIN_ATTEMPT_INTERVAL_MS = 60_000;

export async function cachedUsage(provider: ProviderId): Promise<ProviderUsage | undefined> {
  const cached = await getCachedUsage(provider);
  return cached ? { ...cached.data, source: "cache", stale: true } : undefined;
}
export async function refreshUsage(provider: UsageProvider, force = false): Promise<ProviderUsage> {
  const settings = await readSettings();
  const cached = await getCachedUsage(provider.id);
  if (!force && cached && isCacheFresh(cached, settings.refreshIntervalMinutes)) return cached.data;
  const now = Date.now();
  if (!force && now - (lastAttempt.get(provider.id) ?? 0) < MIN_ATTEMPT_INTERVAL_MS && cached) return { ...cached.data, source: "cache", stale: true };
  const active = refreshes.get(provider.id);
  if (active) return active;
  lastAttempt.set(provider.id, now);
  const operation = provider.refreshUsage().then(async (usage) => { await setCachedUsage(usage); return usage; }).finally(() => refreshes.delete(provider.id));
  refreshes.set(provider.id, operation);
  return operation;
}
