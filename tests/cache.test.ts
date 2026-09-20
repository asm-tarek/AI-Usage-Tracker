import { describe, expect, it } from "vitest";
import { cacheAgeMs, isCacheFresh, migrateStorage } from "../src/storage/storage";
import type { CachedUsage } from "../src/storage/storage-types";

const cached: CachedUsage = { savedAt: 1_000, data: { provider: "claude", windows: [], fetchedAt: new Date(1_000).toISOString(), source: "dom" } };
describe("cache policy", () => {
  it("calculates non-negative age", () => expect(cacheAgeMs(cached, 500)).toBe(0));
  it("treats values inside interval as fresh", () => expect(isCacheFresh(cached, 5, 300_999)).toBe(true));
  it("treats values at interval boundary as stale", () => expect(isCacheFresh(cached, 5, 301_000)).toBe(false));
  it("drops pre-v3 Claude cache while retaining ChatGPT cache and settings", () => {
    const result = migrateStorage({
      version: 2,
      settings: { providers: { chatgpt: true, claude: false }, position: "top-left" },
      providers: {
        chatgpt: { ...cached, data: { ...cached.data, provider: "chatgpt" } },
        claude: cached
      }
    });
    expect(result.version).toBe(3);
    expect(result.providers.chatgpt).toBeDefined();
    expect(result.providers.claude).toBeUndefined();
    expect(result.settings.providers.claude).toBe(false);
    expect(result.settings.position).toBe("top-left");
  });
});
