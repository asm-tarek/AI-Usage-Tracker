import { describe, expect, it } from "vitest";
import { normalizeFraction, normalizePercentage, normalizeResetAt } from "../src/usage/normalization";

describe("percentage normalization", () => {
  it("derives used from remaining", () => expect(normalizePercentage({ remainingPercent: 37 })).toEqual({ usedPercent: 63, remainingPercent: 37 }));
  it("preserves zero", () => expect(normalizePercentage({ usedPercent: 0 })).toEqual({ usedPercent: 0, remainingPercent: 100 }));
  it("keeps unknown values unknown", () => expect(normalizePercentage({ usedPercent: -1, remainingPercent: 150 })).toEqual({}));
  it("normalizes fractions", () => expect(normalizeFraction(0.6312)).toBe(63.12));
  it("rejects invalid fractions", () => expect(normalizeFraction(1.1)).toBeUndefined());
});

describe("reset normalization", () => {
  it("normalizes ISO timestamps", () => expect(normalizeResetAt("2026-09-20T20:00:00+06:00")).toBe("2026-09-20T14:00:00.000Z"));
  it("normalizes Unix seconds", () => expect(normalizeResetAt(1_762_147_153)).toBe("2025-11-03T05:19:13.000Z"));
  it("leaves invalid values unknown", () => expect(normalizeResetAt("later")).toBeUndefined());
});
