import { describe, expect, it } from "vitest";
import { formatRelativeTime } from "../src/utils/dates";
describe("reset countdown", () => {
  it("renders days and hours", () => expect(formatRelativeTime(new Date(2 * 86_400_000 + 4 * 3_600_000).toISOString(), 0)).toBe("Reset in 2d 4h"));
  it("handles elapsed reset", () => expect(formatRelativeTime(new Date(0).toISOString(), 1)).toBe("Reset due"));
});
