import { join, resolve } from "node:path";

export const STORAGE_ROOT = resolve("./storage/vaults");

const isSinglePathSegment = (value: string) =>
  value.length > 0 && !value.includes("/") && !value.includes("\\");

const splitVaultSegments = (vault: string | undefined) => {
  if (!vault || vault.includes("\\")) {
    return null;
  }

  const segments = vault.split("/");
  if (segments.some((segment) => !isSinglePathSegment(segment))) {
    return null;
  }

  return segments;
};

export const resolveVaultPath = (vault: string | undefined) => {
  const segments = splitVaultSegments(vault);
  if (!segments) {
    return null;
  }

  const vaultDir = join(STORAGE_ROOT, ...segments);
  if (!resolve(vaultDir).startsWith(STORAGE_ROOT)) {
    return null;
  }

  return vaultDir;
};

export const resolveVaultFilePath = (vault: string | undefined, ...segments: string[]) => {
  const vaultSegments = splitVaultSegments(vault);
  if (!vaultSegments) {
    return null;
  }

  if (segments.some((segment) => !isSinglePathSegment(segment))) {
    return null;
  }

  const filePath = join(STORAGE_ROOT, ...vaultSegments, ...segments);
  if (!resolve(filePath).startsWith(STORAGE_ROOT)) {
    return null;
  }

  return filePath;
};
