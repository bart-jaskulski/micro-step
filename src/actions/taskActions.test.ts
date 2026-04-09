import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetRateLimitStore } from "~/lib/requestSecurity";

const generateTextMock = vi.fn();

vi.mock("@ai-sdk/google", () => ({
  createGoogleGenerativeAI: vi.fn(() => vi.fn(() => "mock-model")),
}));

vi.mock("ai", () => ({
  generateText: (...args: unknown[]) => generateTextMock(...args),
  tool: (definition: unknown) => definition,
}));

describe("breakdownTask rate limiting", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-01-01T00:00:00Z"));
    resetRateLimitStore();
    generateTextMock.mockReset();
  });

  afterEach(() => {
    resetRateLimitStore();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("limits repeated AI breakdowns and recovers after the window resets", async () => {
    const { consumeAiBreakdownRateLimit } = await import("./taskActions");
    const request = new Request("http://localhost/_server", {
      method: "POST",
      headers: {
        "user-agent": "Vitest",
        "x-forwarded-for": "203.0.113.10",
      },
    });

    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect(consumeAiBreakdownRateLimit(request, "127.0.0.1")).toEqual({
        allowed: true,
      });
    }

    expect(consumeAiBreakdownRateLimit(request, "127.0.0.1")).toMatchObject({
      allowed: false,
    });

    vi.advanceTimersByTime(60_001);

    expect(consumeAiBreakdownRateLimit(request, "127.0.0.1")).toEqual({
      allowed: true,
    });
  });
});
