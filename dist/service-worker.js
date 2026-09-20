// src/storage/storage-types.ts
var DEFAULT_SETTINGS = {
  enabled: true,
  providers: { chatgpt: true, claude: true },
  refreshIntervalMinutes: 5,
  position: "bottom-right",
  alwaysExpanded: false,
  collapsed: false,
  showResetCountdown: true,
  showLastUpdated: true,
  notificationsEnabled: false,
  notificationThreshold: 80,
  debug: false
};

// src/storage/storage.ts
var LEGACY_ROOT_KEY = "aiUsageTracker";
var SCHEMA_KEY = "schemaVersion";
var SETTINGS_KEY = "settings";
var SPLIT_SCHEMA_VERSION = 4;
var PROVIDER_IDS = ["chatgpt", "claude"];
var usageKey = (provider) => `usage:${provider}`;
function normalizeSettings(value) {
  const old = value && typeof value === "object" ? value : {};
  return {
    ...DEFAULT_SETTINGS,
    ...old,
    providers: {
      chatgpt: old.providers?.chatgpt ?? DEFAULT_SETTINGS.providers.chatgpt,
      claude: old.providers?.claude ?? DEFAULT_SETTINGS.providers.claude
    }
  };
}
function migrateStorage(value) {
  if (!value || typeof value !== "object") return { version: 3, settings: structuredClone(DEFAULT_SETTINGS), providers: {} };
  const candidate = value;
  const oldProviders = candidate.providers;
  const providers = {};
  if (oldProviders?.chatgpt) providers.chatgpt = oldProviders.chatgpt;
  if (candidate.version === 3 && oldProviders?.claude) providers.claude = oldProviders.claude;
  return { version: 3, settings: normalizeSettings(candidate.settings), providers };
}
var migration;
function ensureMigrated() {
  migration ??= (async () => {
    const existing = await chrome.storage.local.get([SCHEMA_KEY, LEGACY_ROOT_KEY]);
    if (existing[SCHEMA_KEY] === SPLIT_SCHEMA_VERSION) return;
    const legacy = migrateStorage(existing[LEGACY_ROOT_KEY]);
    const items = { [SCHEMA_KEY]: SPLIT_SCHEMA_VERSION, [SETTINGS_KEY]: legacy.settings };
    for (const id of PROVIDER_IDS) {
      const cached = legacy.providers[id];
      if (cached) items[usageKey(id)] = cached;
    }
    await chrome.storage.local.set(items);
    await chrome.storage.local.remove(LEGACY_ROOT_KEY);
  })().catch((error) => {
    migration = void 0;
    throw error;
  });
  return migration;
}
async function readStorage() {
  await ensureMigrated();
  const keys = [SETTINGS_KEY, ...PROVIDER_IDS.map(usageKey)];
  const result = await chrome.storage.local.get(keys);
  const providers = {};
  for (const id of PROVIDER_IDS) {
    const cached = result[usageKey(id)];
    if (cached) providers[id] = cached;
  }
  return { version: 3, settings: normalizeSettings(result[SETTINGS_KEY]), providers };
}

// src/utils/messaging.ts
function isExtensionMessage(value) {
  if (!value || typeof value !== "object") return false;
  const message = value;
  return message.type === "GET_STATE" || message.type === "REFRESH_ACTIVE" && ["chatgpt", "claude"].includes(String(message.provider));
}

// src/background/service-worker.ts
chrome.runtime.onInstalled.addListener(() => void readStorage());
chrome.runtime.onMessage.addListener((message, _sender, respond) => {
  if (!isExtensionMessage(message)) return false;
  if (message.type === "GET_STATE") {
    void readStorage().then((state) => respond({ ok: true, state })).catch(() => respond({ ok: false }));
    return true;
  }
  return false;
});
//# sourceMappingURL=service-worker.js.map
