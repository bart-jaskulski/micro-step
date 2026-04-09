import { isAbsolute, relative, resolve } from "node:path";

export const STORAGE_ROOT = resolve("./storage/vaults");

const isSinglePathSegment = (value: string) => {
  if (!value || value === "." || value === ".." || value.includes("/") || value.includes("\\")) {
    return false;
  }

  let decoded: string;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    return false;
  }

  return decoded.length > 0
    && decoded !== "."
    && decoded !== ".."
    && !decoded.includes("/")
    && !decoded.includes("\\");
};

const isWithinStorageRoot = (candidate: string) => {
  const resolvedCandidate = resolve(candidate);
  const relativePath = relative(STORAGE_ROOT, resolvedCandidate);

  return !relativePath.startsWith("..") && !isAbsolute(relativePath);
};

const splitVaultSegments = (vault: string | undefined) => {
  if (!vault) {
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

  const vaultDir = resolve(STORAGE_ROOT, ...segments);
  if (!isWithinStorageRoot(vaultDir)) {
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

  const filePath = resolve(STORAGE_ROOT, ...vaultSegments, ...segments);
  if (!isWithinStorageRoot(filePath)) {
    return null;
  }

  return filePath;
};
