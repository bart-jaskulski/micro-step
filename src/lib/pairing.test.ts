import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildPairingHash, buildPairingUrl, parseVaultKeyFromHash } from "./pairing";

describe("pairing link helpers", () => {
  it("builds a hash-based join URL and round-trips base64 keys safely", () => {
    const vaultKey = "abc+/=123";
    const joinUrl = buildPairingUrl("https://focusflow.test", vaultKey);

    expect(joinUrl).toBe("https://focusflow.test/pair#vault=abc%2B%2F%3D123");
    expect(buildPairingHash(vaultKey)).toBe("#vault=abc%2B%2F%3D123");
    expect(parseVaultKeyFromHash("#vault=abc%2B%2F%3D123")).toBe(vaultKey);
  });

  it("ignores hashes that do not contain a vault key", () => {
    expect(parseVaultKeyFromHash("")).toBeNull();
    expect(parseVaultKeyFromHash("#foo=bar")).toBeNull();
  });
});

describe("initializeSync", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns before installing listeners when the device is unpaired", async () => {
    const addWindowListener = vi.spyOn(window, "addEventListener");
    const addDocumentListener = vi.spyOn(document, "addEventListener");
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    vi.doMock("~/stores/vaultStore", () => ({
      vaultState: {
        isPaired: false,
        vaultKey: null,
        vaultPath: null,
        deviceId: null,
      },
    }));

    vi.doMock("~/lib/db", () => ({
      exec: vi.fn(),
      query: vi.fn(),
      exportDb: vi.fn(),
      importDb: vi.fn(),
    }));

    vi.doMock("~/lib/crypto", () => ({
      importKey: vi.fn(),
      encryptData: vi.fn(),
      decryptData: vi.fn(),
    }));

    const { initializeSync } = await import("./sync");

    await initializeSync();

    expect(addDocumentListener).not.toHaveBeenCalledWith("visibilitychange", expect.any(Function));
    expect(addWindowListener).not.toHaveBeenCalledWith("online", expect.any(Function));
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
