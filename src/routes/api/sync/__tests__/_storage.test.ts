import { describe, expect, it } from "vitest";
import { resolveVaultFilePath, resolveVaultPath, STORAGE_ROOT } from "../_storage";

describe("sync storage path resolution", () => {
  it("keeps valid vaults inside the storage root", () => {
    const resolved = resolveVaultPath("tenant-a/vault-01");

    expect(resolved).toBe(`${STORAGE_ROOT}/tenant-a/vault-01`);
  });

  it.each([
    "",
    ".",
    "..",
    "../vault",
    "vault/..",
    "vault//nested",
    "vault\\nested",
    "%2e%2e",
    "vault/%2e%2e",
    "vault%2Fnested",
    "%2fetc",
  ])("rejects unsafe vault path %s", (vault) => {
    expect(resolveVaultPath(vault)).toBeNull();
  });

  it.each([
    "..",
    "../escape.bin",
    "%2e%2e",
    "nested/file.bin",
    "nested\\file.bin",
    "%2fescape.bin",
  ])("rejects unsafe file segment %s", (filename) => {
    expect(resolveVaultFilePath("safe-vault", filename)).toBeNull();
  });
});
