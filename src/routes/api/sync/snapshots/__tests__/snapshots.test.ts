import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdir, writeFile, readFile, readdir, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { POST } from "../../[vault]/snapshots/upload";
import { GET as listGET } from "../../[vault]/snapshots/list";
import { GET as downloadGET } from "../../[vault]/snapshots/download/[filename]";
import {
  MAX_SNAPSHOTS_PER_VAULT,
  SNAPSHOT_UPLOAD_MAX_BYTES,
} from "../../_security";
import { resetRateLimitStore } from "~/lib/requestSecurity";

const STORAGE_ROOT = resolve("./storage/vaults");
const TEST_VAULT = "test-vault-snapshots";
const TEST_DEVICE = "device-snap-001";

function makeRequest(url: string, init?: RequestInit): Request {
  return new Request(new URL(url, "http://localhost:3000"), init);
}

function makeAPIEvent(request: Request, params: Record<string, string> = {}) {
  return { request, params } as any;
}

describe("Snapshot API Endpoints", () => {
  beforeEach(async () => {
    resetRateLimitStore();
    await rm(join(STORAGE_ROOT, TEST_VAULT), { recursive: true, force: true });
  });

  afterEach(async () => {
    resetRateLimitStore();
    await rm(join(STORAGE_ROOT, TEST_VAULT), { recursive: true, force: true });
  });

  describe("POST /api/sync/:vault/snapshots/upload", () => {
    it("stores snapshot and returns key + timestamp", async () => {
      const body = new Uint8Array([10, 20, 30, 40, 50]);
      const request = makeRequest(`/api/sync/${TEST_VAULT}/snapshots/upload`, {
        method: "POST",
        headers: {
          "X-Device-Id": TEST_DEVICE,
        },
        body: body,
      });

      const response = await POST(makeAPIEvent(request, { vault: TEST_VAULT }));
      expect(response.status).toBe(200);

      const json = await response.json();
      expect(json.key).not.toContain(TEST_VAULT);
      expect(json.key).toMatch(/\.snapshot\.bin$/);
      expect(typeof json.timestamp).toBe("number");

      const files = await readdir(join(STORAGE_ROOT, TEST_VAULT, "snapshots"));
      expect(files.length).toBe(1);
      expect(files[0]).toMatch(/\.snapshot\.bin$/);

      const fileData = await readFile(
        join(STORAGE_ROOT, TEST_VAULT, "snapshots", files[0])
      );
      expect(new Uint8Array(fileData)).toEqual(body);
    });

    it("returns 400 when missing headers", async () => {
      const request = makeRequest(`/api/sync/${TEST_VAULT}/snapshots/upload`, {
        method: "POST",
        body: new Uint8Array([1]),
      });

      const response = await POST(makeAPIEvent(request, { vault: TEST_VAULT }));
      expect(response.status).toBe(400);
    });

    it("rejects oversized snapshots with 413", async () => {
      const body = new Uint8Array(SNAPSHOT_UPLOAD_MAX_BYTES + 1);
      const request = makeRequest(`/api/sync/${TEST_VAULT}/snapshots/upload`, {
        method: "POST",
        headers: {
          "X-Device-Id": TEST_DEVICE,
          "content-length": String(body.byteLength),
        },
        body,
      });

      const response = await POST(makeAPIEvent(request, { vault: TEST_VAULT }));

      expect(response.status).toBe(413);
    });

    it("uses a new snapshot as the compaction point and trims stale snapshots", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(6_000));

      try {
        const vaultDir = join(STORAGE_ROOT, TEST_VAULT);
        const snapshotDir = join(vaultDir, "snapshots");
        await mkdir(snapshotDir, { recursive: true });

        await writeFile(join(vaultDir, "1000-device-a.bin"), Buffer.from([1]));
        await writeFile(join(vaultDir, "2000-device-a.bin"), Buffer.from([2]));
        await writeFile(join(vaultDir, "7000-device-a.bin"), Buffer.from([7]));

        for (let timestamp = 1000; timestamp <= 5000; timestamp += 1000) {
          await writeFile(
            join(snapshotDir, `${timestamp}-${TEST_DEVICE}.snapshot.bin`),
            Buffer.from([timestamp / 1000]),
          );
        }

        const request = makeRequest(`/api/sync/${TEST_VAULT}/snapshots/upload`, {
          method: "POST",
          headers: {
            "X-Device-Id": TEST_DEVICE,
          },
          body: new Uint8Array([9, 8, 7]),
        });

        const response = await POST(makeAPIEvent(request, { vault: TEST_VAULT }));
        expect(response.status).toBe(200);

        const remainingChangesets = (await readdir(vaultDir))
          .filter((filename) => filename.endsWith(".bin") && !filename.endsWith(".snapshot.bin"))
          .sort();
        expect(remainingChangesets).toEqual(["7000-device-a.bin"]);

        const remainingSnapshots = (await readdir(snapshotDir)).sort();
        expect(remainingSnapshots).toHaveLength(MAX_SNAPSHOTS_PER_VAULT);
        expect(remainingSnapshots).not.toContain(`1000-${TEST_DEVICE}.snapshot.bin`);
        expect(remainingSnapshots).toContain(`6000-${TEST_DEVICE}.snapshot.bin`);
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe("GET /api/sync/:vault/snapshots/list", () => {
    it("returns snapshots for a vault", async () => {
      const snapshotDir = join(STORAGE_ROOT, TEST_VAULT, "snapshots");
      await mkdir(snapshotDir, { recursive: true });
      await writeFile(
        join(snapshotDir, "1000-device1.snapshot.bin"),
        Buffer.from([1])
      );
      await writeFile(
        join(snapshotDir, "2000-device1.snapshot.bin"),
        Buffer.from([2])
      );

      const request = makeRequest(`/api/sync/${TEST_VAULT}/snapshots/list`);
      const response = await listGET(makeAPIEvent(request, { vault: TEST_VAULT }));
      expect(response.status).toBe(200);

      const json = await response.json();
      expect(json.snapshots).toHaveLength(2);
      expect(json.snapshots[0].timestamp).toBe(1000);
      expect(json.snapshots[1].timestamp).toBe(2000);
      expect(json.snapshots[0].key).toBe(
        "1000-device1.snapshot.bin"
      );
    });

    it("ignores non-snapshot files", async () => {
      const snapshotDir = join(STORAGE_ROOT, TEST_VAULT, "snapshots");
      await mkdir(snapshotDir, { recursive: true });
      await writeFile(
        join(snapshotDir, "1000-device1.snapshot.bin"),
        Buffer.from([1])
      );
      await writeFile(
        join(snapshotDir, "2000-device1.bin"),
        Buffer.from([2])
      );

      const request = makeRequest(`/api/sync/${TEST_VAULT}/snapshots/list`);
      const response = await listGET(makeAPIEvent(request, { vault: TEST_VAULT }));
      const json = await response.json();

      expect(json.snapshots).toHaveLength(1);
      expect(json.snapshots[0].timestamp).toBe(1000);
    });

    it("returns empty array for nonexistent vault", async () => {
      const request = makeRequest("/api/sync/nonexistent-vault/snapshots/list");
      const response = await listGET(makeAPIEvent(request, { vault: "nonexistent-vault" }));
      const json = await response.json();

      expect(json.snapshots).toEqual([]);
    });
  });

  describe("GET /api/sync/:vault/snapshots/download/:filename", () => {
    it("returns the snapshot blob", async () => {
      const snapshotDir = join(STORAGE_ROOT, TEST_VAULT, "snapshots");
      await mkdir(snapshotDir, { recursive: true });
      const blob = Buffer.from([10, 20, 30, 40, 50]);
      await writeFile(join(snapshotDir, "1000-device1.snapshot.bin"), blob);

      const filename = "1000-device1.snapshot.bin";
      const request = makeRequest(`/api/sync/${TEST_VAULT}/snapshots/download/${filename}`);
      const response = await downloadGET(makeAPIEvent(request, { vault: TEST_VAULT, filename }));

      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toBe(
        "application/octet-stream"
      );

      const data = new Uint8Array(await response.arrayBuffer());
      expect(data).toEqual(new Uint8Array(blob));
    });

    it("returns 404 for nonexistent snapshot", async () => {
      const filename = "9999-nodevice.snapshot.bin";
      const request = makeRequest(`/api/sync/${TEST_VAULT}/snapshots/download/${filename}`);
      const response = await downloadGET(makeAPIEvent(request, { vault: TEST_VAULT, filename }));
      expect(response.status).toBe(404);
    });

    it("rejects non-.snapshot.bin keys", async () => {
      const filename = "1000-device1.bin";
      const request = makeRequest(`/api/sync/${TEST_VAULT}/snapshots/download/${filename}`);
      const response = await downloadGET(makeAPIEvent(request, { vault: TEST_VAULT, filename }));
      expect(response.status).toBe(400);
    });
  });

  describe("Full snapshot cycle", () => {
    it("upload → list → download returns same data", async () => {
      const originalData = new Uint8Array([99, 88, 77, 66, 55]);

      // Upload
      const uploadReq = makeRequest(`/api/sync/${TEST_VAULT}/snapshots/upload`, {
        method: "POST",
        headers: {
          "X-Device-Id": "device-A",
        },
        body: originalData,
      });
      const uploadRes = await POST(makeAPIEvent(uploadReq, { vault: TEST_VAULT }));
      const { key, timestamp } = await uploadRes.json();

      // List
      const listReq = makeRequest(`/api/sync/${TEST_VAULT}/snapshots/list`);
      const listRes = await listGET(makeAPIEvent(listReq, { vault: TEST_VAULT }));
      const { snapshots } = await listRes.json();

      expect(snapshots).toHaveLength(1);
      expect(snapshots[0].key).toBe(key);
      expect(snapshots[0].timestamp).toBe(timestamp);

      // Download
      const dlReq = makeRequest(`/api/sync/${TEST_VAULT}/snapshots/download/${key}`);
      const dlRes = await downloadGET(makeAPIEvent(dlReq, { vault: TEST_VAULT, filename: key }));
      const downloaded = new Uint8Array(await dlRes.arrayBuffer());

      expect(downloaded).toEqual(originalData);
    });
  });
});
