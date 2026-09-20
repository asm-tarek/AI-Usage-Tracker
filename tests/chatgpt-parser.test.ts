import { describe, expect, it } from "vitest";
import { parseChatGptUsage } from "../src/providers/chatgpt/chatgpt-parser";

describe("ChatGPT native usage parser", () => {
  it("normalizes duration-based and additional windows", () => {
    const result = parseChatGptUsage({
      plan_type: "plus",
      rate_limit: {
        primary_window: { used_percent: 24, limit_window_seconds: 18_000, reset_at: 1_762_147_153 },
        secondary_window: { used_percent: 61, limit_window_seconds: 604_800, reset_at: 1_762_650_589 }
      },
      additional_rate_limits: [{
        limit_name: "GPT-5.3-Codex-Spark",
        rate_limit: { primary_window: { used_percent: 12, limit_window_seconds: 18_000 } }
      }]
    }, "2026-09-16T10:00:00Z");
    expect(result?.plan).toBe("ChatGPT Plus");
    expect(result?.source).toBe("internal-api");
    expect(result?.windows).toHaveLength(2);
    expect(result?.windows[0]).toMatchObject({ label: "5-hour limit", usedPercent: 24, remainingPercent: 76 });
    expect(result?.windows[1]?.label).toBe("Weekly limit");
    expect(result?.windows[0]?.resetAt).toBe("2025-11-03T05:19:13.000Z");
  });

  it("labels windows by duration rather than slot", () => {
    const result = parseChatGptUsage({ rate_limit: { primary_window: { used_percent: 10, limit_window_seconds: 604_800 } } });
    expect(result?.windows[0]?.label).toBe("Weekly limit");
  });

  it("shows the native monthly free limit for ChatGPT Free accounts", () => {
    const result = parseChatGptUsage({
      plan_type: "free",
      rate_limit: {
        primary_window: { used_percent: 35, limit_window_seconds: 2_592_000, reset_at: 1_799_000_000 },
        secondary_window: { used_percent: 10, limit_window_seconds: 18_000, reset_at: 1_799_000_000 }
      }
    });
    expect(result?.plan).toBe("ChatGPT Free");
    expect(result?.windows).toHaveLength(1);
    expect(result?.windows[0]).toMatchObject({ label: "Monthly free limits", usedPercent: 35, remainingPercent: 65 });
  });

  it("rejects unknown or malformed responses", () => {
    expect(parseChatGptUsage({ rate_limit: { primary_window: { used_percent: 101 } } })).toBeNull();
  });
});
