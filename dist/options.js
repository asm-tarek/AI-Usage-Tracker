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
async function readSettings() {
  await ensureMigrated();
  const result = await chrome.storage.local.get(SETTINGS_KEY);
  return normalizeSettings(result[SETTINGS_KEY]);
}
async function writeSettings(settings) {
  await ensureMigrated();
  await chrome.storage.local.set({ [SETTINGS_KEY]: settings });
}

// src/options/options.ts
var el = (id) => document.getElementById(id);
async function load() {
  const s = await readSettings();
  el("enabled").checked = s.enabled;
  el("alwaysExpanded").checked = s.alwaysExpanded;
  el("position").value = s.position;
  el("countdown").checked = s.showResetCountdown;
  el("updated").checked = s.showLastUpdated;
  el("chatgpt").checked = s.providers.chatgpt;
  el("claude").checked = s.providers.claude;
  el("interval").value = String(s.refreshIntervalMinutes);
  el("threshold").value = String(s.notificationThreshold);
  el("debug").checked = s.debug;
}
el("settings").addEventListener("submit", async (event) => {
  event.preventDefault();
  const current = await readSettings();
  const settings = {
    ...current,
    enabled: el("enabled").checked,
    alwaysExpanded: el("alwaysExpanded").checked,
    position: el("position").value,
    showResetCountdown: el("countdown").checked,
    showLastUpdated: el("updated").checked,
    providers: { chatgpt: el("chatgpt").checked, claude: el("claude").checked },
    refreshIntervalMinutes: Number(el("interval").value),
    notificationThreshold: Math.min(100, Math.max(1, Number(el("threshold").value) || 80)),
    debug: el("debug").checked
  };
  await writeSettings(settings);
  el("status").value = "Saved";
});
void load();
//# sourceMappingURL=options.js.map
