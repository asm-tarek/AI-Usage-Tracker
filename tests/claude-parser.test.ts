import { describe, expect, it } from "vitest";
import { parseClaudeUsage } from "../src/providers/claude/claude-parser";

describe("Claude native usage parser", () => {
  it("normalizes simultaneous native quota windows", () => {
    const result = parseClaudeUsage({
      five_hour: { utilization: 27.5, resets_at: "2026-09-16T12:00:00Z" },
      seven_day: { utilization: 63, resets_at: "2026-09-20T14:00:00Z" },
      seven_day_opus: { utilization: 44, resets_at: null },
      unrelated: { value: 999 }
    }, { rate_limit_tier: "default_claude_ai" }, "2026-09-16T10:00:00Z");
    expect(result?.source).toBe("internal-api");
    expect(result?.plan).toBe("Claude Pro");
    expect(result?.windows).toHaveLength(2);
    expect(result?.windows[0]).toMatchObject({ id: "five_hour", label: "Current session", usedPercent: 27.5, remainingPercent: 72.5 });
    expect(result?.windows[1]).toMatchObject({ id: "seven_day", label: "Weekly limit" });
    expect(result?.windows[1]?.description).toBeUndefined();
    expect(result?.windows.map((window) => window.shortLabel)).toEqual(["cs", "wk"]);
  });

  it("adds a weekly limit once Claude reports it with a reset time", () => {
    const result = parseClaudeUsage({
      five_hour: { utilization: 10, resets_at: "2026-09-16T12:00:00Z" },
      seven_day: { utilization: 20, resets_at: "2026-09-20T14:00:00Z" },
      seven_day_sonnet: { utilization: 35, resets_at: "2026-09-20T14:00:00Z" },
      seven_day_future: { utilization: 5, resets_at: "2026-09-20T14:00:00Z", display_name: "Weekly · New model" },
      seven_day_nimbus: { utilization: 50, resets_at: "2026-09-20T14:00:00Z" }
    }, {});
    expect(result?.windows.map((window) => `${window.label}/${window.shortLabel}`))
      .toEqual(["Current session/cs", "Weekly limit/wk", "Sonnet/so", "New model/ne"]);
  });

  it("shows only the 5-hour and weekly limits", () => {
    const result = parseClaudeUsage({
      five_hour: { utilization: 10 },
      seven_day: { utilization: 15, resets_at: "2026-09-20T14:00:00Z" },
      seven_day_nimbus: { utilization: 20 },
      seven_day_quill: { utilization: 30 },
      seven_day_future: { utilization: 40, display_name: "Weekly · New model", model_name: "New model" }
    }, { rate_limit_tier: "pro" });
    expect(result?.windows.map((window) => window.label)).toEqual(["Current session", "Weekly limit"]);
  });

  it("hides the complete weekly section when its reset data is unavailable", () => {
    const result = parseClaudeUsage({
      five_hour: { utilization: 10, resets_at: "2026-09-16T12:00:00Z" },
      seven_day: { utilization: 0, resets_at: null }
    }, { rate_limit_tier: "pro" });
    expect(result?.windows).toHaveLength(1);
    expect(result?.windows[0]?.label).toBe("Current session");
    expect(result?.windows.some((window) => window.label === "Weekly limit")).toBe(false);
  });

  it("prefers a specific customer-facing subscription plan", () => {
    const result = parseClaudeUsage({ five_hour: { utilization: 10 } }, {
      subscription_plan: "max_20x",
      rate_limit_tier: "default_claude_ai"
    });
    expect(result?.plan).toBe("Claude Max 20×");
  });

  it("rejects unknown response shapes", () => expect(parseClaudeUsage({ message: "changed" }, {})).toBeNull());
  it("rejects out-of-range utilization", () => expect(parseClaudeUsage({ five_hour: { utilization: 120 } }, {})).toBeNull());
});
