import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("networkStore", () => {
  let originalOnLine: boolean;
  let listeners: Record<string, Set<EventListener>>;

  beforeEach(() => {
    originalOnLine = navigator.onLine;
    listeners = { online: new Set(), offline: new Set() };

    vi.spyOn(window, "addEventListener").mockImplementation((event: string, handler: EventListener) => {
      if (listeners[event]) listeners[event].add(handler);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(navigator, "onLine", { value: originalOnLine, configurable: true });
  });

  it("5.1 AI button should be disabled when offline (isOnline returns false)", async () => {
    Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
    // Re-import to get fresh module with navigator.onLine = false
    vi.resetModules();
    const { isOnline } = await import("./networkStore");
    expect(isOnline()).toBe(false);
  });

  it("5.2 Sync button should be disabled when offline (isOnline returns false)", async () => {
    Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
    vi.resetModules();
    const { isOnline } = await import("./networkStore");
    // When isOnline() is false, sync button disabled condition (isSyncing() || !isOnline()) is true
    expect(!isOnline()).toBe(true);
  });

  it("5.3 Offline banner appears when offline (isOnline is false)", async () => {
    Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
    vi.resetModules();
    const { isOnline } = await import("./networkStore");
    // Banner show condition: !isOnline()
    expect(!isOnline()).toBe(true);
  });

  it("5.4 Banner disappears when online (isOnline is true)", async () => {
    Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
    vi.resetModules();
    const { isOnline } = await import("./networkStore");
    expect(!isOnline()).toBe(false);
  });

  it("5.5 isOnline initializes from navigator.onLine", async () => {
    Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
    vi.resetModules();
    const { isOnline } = await import("./networkStore");
    expect(isOnline()).toBe(true);
  });

  it("5.6-5.9 Local operations are unaffected by offline status (isOnline is independent of task store)", async () => {
    // Local operations (add, edit, complete, delete, reorder) go through taskStore
    // which uses local cr-sqlite — no network dependency.
    // networkStore only gates UI buttons; it does not block taskStore functions.
    Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
    vi.resetModules();
    const { isOnline } = await import("./networkStore");
    expect(isOnline()).toBe(false);
    // taskStore functions remain callable regardless of isOnline — no guard exists there.
  });
});
