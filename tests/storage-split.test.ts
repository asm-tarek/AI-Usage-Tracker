import { beforeEach, describe, expect, it } from "vitest";
import {
  clearCachedUsage, getCachedUsage, readSettings, readStorage, resetMigrationStateForTests, setCachedUsage, usageKey, writeSettings
} from "../src/storage/storage";
import { DEFAULT_SETTINGS } from "../src/storage/storage-types";
import type { ProviderUsage } from "../src/providers/types";

// Minimal async chrome.storage.local with a deliberate delay, so interleaved
// read-modify-write cycles would actually race if the code still used them.
function installStorage(initial: Record<string, unknown> = {}) {
  const data: Record<string, unknown> = structuredClone(initial);
  const tick = () => new Promise((resolve) => setTimeout(resolve, 1));
  const pick = (keys: string | string[]) => {
    const out: Record<string, unknown> = {};
    for (const key of Array.isArray(keys) ? keys : [keys]) if (key in data) out[key] = structuredClone(data[key]);
    return out;
  };
  (globalThis as unknown as { chrome: unknown }).chrome = {
    storage: {
      local: {
        get: async (keys: string | string[]) => { await tick(); return pick(keys); },
        set: async (items: Record<string, unknown>) => { await tick(); Object.assign(data, structuredClone(items)); },
        remove: async (keys: string | string[]) => { await tick(); for (const key of Array.isArray(keys) ? keys : [keys]) delete data[key]; }
      }
    }
  };
  return data;
}

const usage = (provider: "chatgpt" | "claude"): ProviderUsage => ({
  provider, windows: [{ id: "w", label: "W", usedPercent: 10 }], fetchedAt: new Date(0).toISOString(), source: "internal-api"
});

describe("split storage", () => {
  beforeEach(() => resetMigrationStateForTests());

  it("migrates the legacy root object into separate keys", async () => {
    const data = installStorage({
      aiUsageTracker: { version: 3, settings: { position: "top-left" }, providers: { claude: { data: usage("claude"), savedAt: 5 } } }
    });
    const state = await readStorage();
    expect(state.settings.position).toBe("top-left");
    expect(state.providers.claude?.savedAt).toBe(5);
    expect("aiUsageTracker" in data).toBe(false);
    expect(data[usageKey("claude")]).toBeDefined();
  });

  it("keeps both providers' caches and settings when writes interleave", async () => {
    installStorage();
    await Promise.all([
      setCachedUsage(usage("claude")),
      setCachedUsage(usage("chatgpt")),
      writeSettings({ ...DEFAULT_SETTINGS, alwaysExpanded: true })
    ]);
    expect((await getCachedUsage("claude"))?.data.provider).toBe("claude");
    expect((await getCachedUsage("chatgpt"))?.data.provider).toBe("chatgpt");
    expect((await readSettings()).alwaysExpanded).toBe(true);
  });

  it("clears one provider without touching the other", async () => {
    installStorage();
    await setCachedUsage(usage("claude"));
    await setCachedUsage(usage("chatgpt"));
    await clearCachedUsage("claude");
    const state = await readStorage();
    expect(state.providers.claude).toBeUndefined();
    expect(state.providers.chatgpt).toBeDefined();
  });
});
