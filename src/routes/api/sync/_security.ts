import { readdir, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import {
  buildRateLimitBucketKey,
  consumeRateLimit,
  createRateLimitResponse,
  type RateLimitPolicy,
} from "~/lib/requestSecurity";

type StoredFile = {
  filename: string;
  path: string;
  size: number;
  timestamp: number;
};

type BodyReadResult =
  | {
      ok: true;
      body: Uint8Array;
    }
  | {
      ok: false;
      response: Response;
    };

export const CHANGESET_UPLOAD_MAX_BYTES = 256 * 1024;
export const SNAPSHOT_UPLOAD_MAX_BYTES = 5 * 1024 * 1024;
export const MAX_CHANGESETS_PER_VAULT = 200;
export const MAX_CHANGESET_BYTES_PER_VAULT = 8 * 1024 * 1024;
export const MAX_SNAPSHOTS_PER_VAULT = 5;

const SYNC_READ_POLICIES: readonly RateLimitPolicy[] = [
  {
    id: "sync-read-1m",
    maxRequests: 120,
    windowMs: 60_000,
  },
];

const SYNC_WRITE_POLICIES: readonly RateLimitPolicy[] = [
  {
    id: "sync-write-1m",
    maxRequests: 30,
    windowMs: 60_000,
  },
];

const PAYLOAD_TOO_LARGE_RESPONSE = (limit: number) =>
  new Response(`Payload too large. Limit is ${limit} bytes.`, { status: 413 });

const parseTimestamp = (filename: string) => {
  return Number.parseInt(filename.split("-")[0] ?? "", 10);
};

const compareStoredFiles = (left: StoredFile, right: StoredFile) => {
  if (left.timestamp !== right.timestamp) {
    return left.timestamp - right.timestamp;
  }

  return left.filename.localeCompare(right.filename);
};

const listStoredFiles = async (
  directory: string,
  isMatch: (filename: string) => boolean,
): Promise<StoredFile[]> => {
  let entries;

  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    return [];
  }

  const files = await Promise.all(
    entries
      .filter((entry) => entry.isFile())
      .map(async (entry) => {
        if (!isMatch(entry.name)) {
          return null;
        }

        const timestamp = parseTimestamp(entry.name);
        if (Number.isNaN(timestamp)) {
          return null;
        }

        const path = join(directory, entry.name);
        const metadata = await stat(path);

        return {
          filename: entry.name,
          path,
          size: metadata.size,
          timestamp,
        } satisfies StoredFile;
      }),
  );

  return files.filter((file): file is StoredFile => file !== null).sort(compareStoredFiles);
};

const listChangesets = (vaultDir: string) =>
  listStoredFiles(vaultDir, (filename) => filename.endsWith(".bin") && !filename.endsWith(".snapshot.bin"));

const listSnapshots = (snapshotDir: string) =>
  listStoredFiles(snapshotDir, (filename) => filename.endsWith(".snapshot.bin"));

export const enforceSyncRateLimit = (
  request: Request,
  clientAddress: string | undefined,
  routeFamily: "read" | "write",
) => {
  const bucketKey = buildRateLimitBucketKey(request, `sync-${routeFamily}`, clientAddress);
  const result = consumeRateLimit(
    bucketKey,
    routeFamily === "write" ? SYNC_WRITE_POLICIES : SYNC_READ_POLICIES,
  );

  if (result.allowed) {
    return null;
  }

  return createRateLimitResponse("Too many sync requests. Please retry shortly.", result.retryAfterMs);
};

export const readRequestBodyWithinLimit = async (
  request: Request,
  maxBytes: number,
): Promise<BodyReadResult> => {
  const contentLengthHeader = request.headers.get("content-length");
  if (contentLengthHeader) {
    const contentLength = Number.parseInt(contentLengthHeader, 10);
    if (!Number.isNaN(contentLength) && contentLength > maxBytes) {
      return {
        ok: false,
        response: PAYLOAD_TOO_LARGE_RESPONSE(maxBytes),
      };
    }
  }

  if (!request.body) {
    return {
      ok: true,
      body: new Uint8Array(),
    };
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    totalBytes += value.byteLength;
    if (totalBytes > maxBytes) {
      await reader.cancel();
      return {
        ok: false,
        response: PAYLOAD_TOO_LARGE_RESPONSE(maxBytes),
      };
    }

    chunks.push(value);
  }

  const body = new Uint8Array(totalBytes);
  let offset = 0;

  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return {
    ok: true,
    body,
  };
};

export const pruneVaultChangesets = async (vaultDir: string) => {
  const changesets = await listChangesets(vaultDir);
  let totalBytes = changesets.reduce((sum, entry) => sum + entry.size, 0);

  while (changesets.length > MAX_CHANGESETS_PER_VAULT || totalBytes > MAX_CHANGESET_BYTES_PER_VAULT) {
    const oldest = changesets.shift();
    if (!oldest) {
      break;
    }

    totalBytes -= oldest.size;
    await rm(oldest.path, { force: true });
  }
};

export const pruneVaultAfterSnapshot = async (vaultDir: string, snapshotTimestamp: number) => {
  const changesets = await listChangesets(vaultDir);
  for (const entry of changesets) {
    if (entry.timestamp < snapshotTimestamp) {
      await rm(entry.path, { force: true });
    }
  }

  const snapshotDir = join(vaultDir, "snapshots");
  const snapshots = await listSnapshots(snapshotDir);
  const staleSnapshots = Math.max(snapshots.length - MAX_SNAPSHOTS_PER_VAULT, 0);

  for (const entry of snapshots.slice(0, staleSnapshots)) {
    await rm(entry.path, { force: true });
  }

  await pruneVaultChangesets(vaultDir);
};
