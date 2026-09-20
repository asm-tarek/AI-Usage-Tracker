import type { ProviderId, ProviderUsage } from "../providers/types";
import { DEFAULT_SETTINGS, type CachedUsage, type ExtensionStorage, type UserSettings } from "./storage-types";

// Each independently-updated value lives under its own key. A single shared
// root object forced read-modify-write cycles, so a Claude tab and a ChatGPT
// tab refreshing at the same time (or a collapse toggle during a fetch) could
// silently overwrite each other's writes.
const LEGACY_ROOT_KEY = "aiUsageTracker";
const SCHEMA_KEY = "schemaVersion";
const SETTINGS_KEY = "settings";
const SPLIT_SCHEMA_VERSION = 4;
const PROVIDER_IDS: readonly ProviderId[] = ["chatgpt", "claude"];

export const usageKey = (provider: ProviderId): string => `usage:${provider}`;

export function normalizeSettings(value: unknown): UserSettings {
  const old = (value && typeof value === "object" ? value : {}) as Partial<UserSettings> & { providers?: Record<string, boolean> };
  return {
    ...DEFAULT_SETTINGS,
    ...old,
    providers: {
      chatgpt: old.providers?.chatgpt ?? DEFAULT_SETTINGS.providers.chatgpt,
      claude: old.providers?.claude ?? DEFAULT_SETTINGS.providers.claude
    }
  };
}

/** Converts the legacy single-object layout (schema v1–v3) into its logical contents. */
export function migrateStorage(value: unknown): ExtensionStorage {
  if (!value || typeof value !== "object") return { version: 3, settings: structuredClone(DEFAULT_SETTINGS), providers: {} };
  const candidate = value as Partial<ExtensionStorage>;
  const oldProviders = candidate.providers as Record<string, CachedUsage | undefined> | undefined;
  const providers: ExtensionStorage["providers"] = {};
  if (oldProviders?.chatgpt) providers.chatgpt = oldProviders.chatgpt;
  // Drop pre-v3 Claude snapshots once so an obsolete Weekly limits heading
  // cannot survive the stricter availability rule.
  if (candidate.version === 3 && oldProviders?.claude) providers.claude = oldProviders.claude;
  return { version: 3, settings: normalizeSettings(candidate.settings), providers };
}

let migration: Promise<void> | undefined;
/** Test hook: forget that this context already migrated. */
export function resetMigrationStateForTests(): void { migration = undefined; }
function ensureMigrated(): Promise<void> {
  migration ??= (async () => {
    const existing = await chrome.storage.local.get([SCHEMA_KEY, LEGACY_ROOT_KEY]);
    if (existing[SCHEMA_KEY] === SPLIT_SCHEMA_VERSION) return;
    const legacy = migrateStorage(existing[LEGACY_ROOT_KEY]);
    const items: Record<string, unknown> = { [SCHEMA_KEY]: SPLIT_SCHEMA_VERSION, [SETTINGS_KEY]: legacy.settings };
    for (const id of PROVIDER_IDS) {
      const cached = legacy.providers[id];
      if (cached) items[usageKey(id)] = cached;
    }
    // Idempotent: concurrent contexts migrating at once write identical values.
    await chrome.storage.local.set(items);
    await chrome.storage.local.remove(LEGACY_ROOT_KEY);
  })().catch((error) => { migration = undefined; throw error; });
  return migration;
}

export async function readStorage(): Promise<ExtensionStorage> {
  await ensureMigrated();
  const keys = [SETTINGS_KEY, ...PROVIDER_IDS.map(usageKey)];
  const result = await chrome.storage.local.get(keys);
  const providers: ExtensionStorage["providers"] = {};
  for (const id of PROVIDER_IDS) {
    const cached = result[usageKey(id)] as CachedUsage | undefined;
    if (cached) providers[id] = cached;
  }
  return { version: 3, settings: normalizeSettings(result[SETTINGS_KEY]), providers };
}

export async function readSettings(): Promise<UserSettings> {
  await ensureMigrated();
  const result = await chrome.storage.local.get(SETTINGS_KEY);
  return normalizeSettings(result[SETTINGS_KEY]);
}
export async function writeSettings(settings: UserSettings): Promise<void> {
  await ensureMigrated();
  await chrome.storage.local.set({ [SETTINGS_KEY]: settings });
}
export async function getCachedUsage(provider: ProviderId): Promise<CachedUsage | undefined> {
  await ensureMigrated();
  const key = usageKey(provider);
  return (await chrome.storage.local.get(key))[key] as CachedUsage | undefined;
}
export async function setCachedUsage(data: ProviderUsage): Promise<void> {
  await ensureMigrated();
  const cached: CachedUsage = { data, savedAt: Date.now() };
  await chrome.storage.local.set({ [usageKey(data.provider)]: cached });
}
export async function clearCachedUsage(provider: ProviderId): Promise<void> {
  await ensureMigrated();
  await chrome.storage.local.remove(usageKey(provider));
}
export const isSettingsChange = (changes: Record<string, unknown>): boolean => SETTINGS_KEY in changes;
export function cacheAgeMs(cached: CachedUsage, now = Date.now()): number { return Math.max(0, now - cached.savedAt); }
export function isCacheFresh(cached: CachedUsage, intervalMinutes: number, now = Date.now()): boolean {
  return cacheAgeMs(cached, now) < intervalMinutes * 60_000;
}
