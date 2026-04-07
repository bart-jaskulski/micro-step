import { beforeEach, describe, expect, it, vi } from "vitest";

describe("preferencesStore", () => {
  let storage = new Map<string, string>();

  beforeEach(() => {
    vi.resetModules();
    storage = new Map<string, string>();
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => {
          storage.set(key, value);
        },
      },
    });
  });

  it("falls back to medium for missing or invalid stored values", async () => {
    const { parseBreakdownGranularity, DEFAULT_BREAKDOWN_GRANULARITY } = await import("./preferencesStore");

    expect(parseBreakdownGranularity(null)).toBe(DEFAULT_BREAKDOWN_GRANULARITY);
    expect(parseBreakdownGranularity("unexpected")).toBe(DEFAULT_BREAKDOWN_GRANULARITY);
  });

  it("initializes from local storage when a valid preference exists", async () => {
    window.localStorage.setItem("microstep:breakdown-granularity", "high");

    const { breakdownGranularity } = await import("./preferencesStore");

    expect(breakdownGranularity()).toBe("high");
  });

  it("persists updates to local storage", async () => {
    const {
      breakdownGranularity,
      BREAKDOWN_GRANULARITY_STORAGE_KEY,
      setBreakdownGranularity,
    } = await import("./preferencesStore");

    setBreakdownGranularity("low");

    expect(breakdownGranularity()).toBe("low");
    expect(window.localStorage.getItem(BREAKDOWN_GRANULARITY_STORAGE_KEY)).toBe("low");
  });
});
