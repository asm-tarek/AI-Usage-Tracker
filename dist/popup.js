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

// src/utils/dates.ts
function formatRelativeTime(iso, now = Date.now()) {
  const diff = new Date(iso).getTime() - now;
  if (!Number.isFinite(diff)) return "Unknown reset time";
  if (diff <= 0) return "Reset due";
  const minutes = Math.floor(diff / 6e4);
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor(minutes % 1440 / 60);
  const mins = minutes % 60;
  if (days) return `Reset in ${days}d ${hours}h`;
  if (hours) return `Reset in ${hours}h ${mins}m`;
  return `Reset in ${Math.max(1, mins)}m`;
}

// src/popup/popup.ts
var names = { chatgpt: "ChatGPT", claude: "Claude" };
function escapeHtml(value) {
  return value.replace(/[&<>'"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[c] ?? c);
}
async function render() {
  const state = await readStorage();
  const container = document.querySelector("#providers");
  if (!container) return;
  container.innerHTML = Object.keys(names).map((id) => {
    const usage = state.providers[id]?.data;
    const lines = usage?.windows.map((w) => `<div class="line"><span>${escapeHtml(w.label)}</span><span>${w.usedPercent === void 0 ? "Unknown" : `${Math.round(w.usedPercent)}%`}${w.resetAt ? ` \xB7 ${formatRelativeTime(w.resetAt).replace("Reset in ", "")}` : ""}</span></div>`).join("") ?? '<div class="line">No cached usage</div>';
    return `<section class="provider"><h2>${names[id]}</h2>${lines}</section>`;
  }).join("");
}
document.querySelector("#options")?.addEventListener("click", () => void chrome.runtime.openOptionsPage());
document.querySelector("#refresh")?.addEventListener("click", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id) await chrome.tabs.reload(tab.id);
  window.close();
});
void render();
//# sourceMappingURL=popup.js.map
