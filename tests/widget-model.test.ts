import { describe, expect, it } from "vitest";
import { compactReset, isDarkBackground, overallSeverity, parseRgb, pillSegments, severity, shortLabel } from "../src/ui/widget-model";
import type { ProviderUsage } from "../src/providers/types";

const usage = (windows: ProviderUsage["windows"]): ProviderUsage => ({ provider: "claude", windows, fetchedAt: new Date(0).toISOString(), source: "internal-api" });

describe("widget model", () => {
  it("keeps color for limits that matter", () => {
    expect(severity(69.9)).toBe("normal");
    expect(severity(70)).toBe("warning");
    expect(severity(89.9)).toBe("warning");
    expect(severity(90)).toBe("critical");
  });

  it("derives compact window labels for both providers", () => {
    expect(shortLabel({ id: "five_hour", label: "Current session" })).toBe("5h");
    expect(shortLabel({ id: "seven_day", label: "All models" })).toBe("wk");
    expect(shortLabel({ id: "general-primary", label: "5-hour limit" })).toBe("5h");
    expect(shortLabel({ id: "general-secondary", label: "Weekly limit" })).toBe("wk");
    expect(shortLabel({ id: "general-primary", label: "Monthly free limits" })).toBe("mo");
    expect(shortLabel({ id: "x", label: "3-day" })).toBe("3d");
    expect(shortLabel({ id: "x", label: "Primary" })).toBe("");
  });

  it("shows every limit in order, each with its own severity", () => {
    const segments = pillSegments(usage([
      { id: "five_hour", label: "Current session", usedPercent: 21 },
      { id: "seven_day", label: "All models", usedPercent: 93, resetAt: "2030-01-01T00:00:00Z" },
      { id: "broken", label: "Broken" }
    ]));
    expect(segments.map((s) => `${s.label} ${s.percent} ${s.severity}`)).toEqual(["5h 21 normal", "wk 93 critical"]);
    expect(segments[1]?.resetAt).toBe("2030-01-01T00:00:00Z");
    expect(overallSeverity(segments)).toBe("critical");
    expect(overallSeverity(pillSegments(usage([{ id: "five_hour", label: "Current session", usedPercent: 75 }])))).toBe("warning");
    expect(pillSegments(undefined)).toEqual([]);
  });

  it("falls back to a shortened name for unrecognized windows", () => {
    expect(pillSegments(usage([{ id: "x", label: "Primary", usedPercent: 5 }]))[0]?.label).toBe("Primary");
  });

  it("formats compact reset times", () => {
    const now = Date.parse("2030-01-01T00:00:00Z");
    expect(compactReset("2030-01-01T00:42:00Z", now)).toBe("42m");
    expect(compactReset("2030-01-01T02:14:30Z", now)).toBe("2h 14m");
    expect(compactReset("2029-12-31T23:00:00Z", now)).toBe("now");
  });

  it("detects the page's theme from its background color", () => {
    expect(parseRgb("rgba(1, 2, 3, 0.5)")).toEqual({ r: 1, g: 2, b: 3, a: 0.5 });
    expect(isDarkBackground("rgb(33, 33, 33)")).toBe(true);
    expect(isDarkBackground("rgb(250, 249, 245)")).toBe(false);
    expect(isDarkBackground("rgba(0, 0, 0, 0)")).toBeUndefined();
    expect(isDarkBackground("oklch(0.2 0 0)")).toBeUndefined();
  });
});
