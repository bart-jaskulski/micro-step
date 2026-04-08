import { describe, expect, it } from "vitest";
import { hashVaultKeyToPath } from "./crypto";

describe("hashVaultKeyToPath", () => {
  it("returns a single URL-safe path segment", async () => {
    const path = await hashVaultKeyToPath("++//");

    expect(path).toMatch(/^[0-9a-f]{64}$/);
    expect(path).not.toContain("/");
    expect(path).not.toContain("+");
    expect(path).not.toContain("=");
  });
});
