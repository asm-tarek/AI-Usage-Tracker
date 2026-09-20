import { describe, expect, it } from "vitest";
import { displayPercent, loggedOutMessage } from "../src/ui/usage-widget";

describe("usage widget visibility", () => {
  it("hides a quota section when neither percentage is available", () => {
    expect(displayPercent({ id: "seven_day", label: "All models", description: "Weekly limits" })).toBeUndefined();
  });

  it("accepts a valid used or remaining percentage", () => {
    expect(displayPercent({ id: "used", label: "Used", usedPercent: 42 })).toBe(42);
    expect(displayPercent({ id: "remaining", label: "Remaining", remainingPercent: 25 })).toBe(75);
  });

  it("rejects malformed percentages", () => {
    expect(displayPercent({ id: "invalid", label: "Invalid", usedPercent: Number.NaN })).toBeUndefined();
    expect(displayPercent({ id: "too-high", label: "Too high", usedPercent: 101 })).toBeUndefined();
  });

  it("shows concise sign-in guidance without suggesting a retry", () => {
    const expected = "Sign in to view usage data. Usage information isn’t available while signed out.";
    expect(loggedOutMessage("chatgpt")).toBe(expected);
    expect(loggedOutMessage("claude")).toBe(expected);
    expect(loggedOutMessage("chatgpt")).not.toMatch(/retry|temporarily unavailable/i);
  });
});
