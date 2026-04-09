import { describe, expect, it } from "vitest";
import { formatDueDateLabel, normalizeDateOnlyInput, normalizeDueDateValue } from "./dates";

describe("normalizeDateOnlyInput", () => {
  it("stores date-only input as a timezone-safe UTC calendar day", () => {
    expect(normalizeDateOnlyInput("2026-04-08")).toBe(Date.UTC(2026, 3, 8));
  });

  it("rejects invalid calendar dates", () => {
    expect(normalizeDateOnlyInput("2026-02-30")).toBeNull();
  });
});

describe("normalizeDueDateValue", () => {
  it("normalizes ISO date strings without shifting the selected day", () => {
    expect(normalizeDueDateValue("2026-04-08")).toBe(Date.UTC(2026, 3, 8));
  });
});

describe("formatDueDateLabel", () => {
  it("renders the stored day without the previous-day timezone bug", () => {
    expect(formatDueDateLabel(Date.UTC(2026, 3, 8), new Date("2026-04-01T12:00:00Z"))).toBe("Apr 8");
  });

  it("uses today and tomorrow labels against the local calendar day", () => {
    const now = new Date("2026-04-08T12:00:00Z");

    expect(formatDueDateLabel(Date.UTC(2026, 3, 8), now)).toBe("Today");
    expect(formatDueDateLabel(Date.UTC(2026, 3, 9), now)).toBe("Tomorrow");
  });
});
