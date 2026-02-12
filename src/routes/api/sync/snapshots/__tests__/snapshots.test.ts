import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdir, writeFile, readFile, readdir, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { POST } from "../upload";
import { GET as listGET } from "../list";
import { GET as downloadGET } from "../download/[...key]";

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
    await rm(join(STORAGE_ROOT, TEST_VAULT), { recursive: true, force: true });
  });

  afterEach(async () => {
    await rm(join(STORAGE_ROOT, TEST_VAULT), { recursive: true, force: true });
  });

  describe("POST /api/sync/snapshots/upload", () => {
    it("stores snapshot and returns key + timestamp", async () => {
      const body = new Uint8Array([10, 20, 30, 40, 50]);
      const request = makeRequest("/api/sync/snapshots/upload", {
        method: "POST",
        headers: {
          "X-Vault-Path": TEST_VAULT,
          "X-Device-Id": TEST_DEVICE,
        },
        body: body,
      });

      const response = await POST(makeAPIEvent(request));
      expect(response.status).toBe(200);

      const json = await response.json();
      expect(json.key).toContain(TEST_VAULT);
      expect(json.key).toContain("snapshots");
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
      const request = makeRequest("/api/sync/snapshots/upload", {
        method: "POST",
        body: new Uint8Array([1]),
      });

      const response = await POST(makeAPIEvent(request));
      expect(response.status).toBe(400);
    });
  });

  describe("GET /api/sync/snapshots/list", () => {
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

      const request = makeRequest(
        `/api/sync/snapshots/list?vaultPath=${TEST_VAULT}`
      );
      const response = await listGET(makeAPIEvent(request));
      expect(response.status).toBe(200);

      const json = await response.json();
      expect(json.snapshots).toHaveLength(2);
      expect(json.snapshots[0].timestamp).toBe(1000);
      expect(json.snapshots[1].timestamp).toBe(2000);
      expect(json.snapshots[0].key).toBe(
        `${TEST_VAULT}/snapshots/1000-device1.snapshot.bin`
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

      const request = makeRequest(
        `/api/sync/snapshots/list?vaultPath=${TEST_VAULT}`
      );
      const response = await listGET(makeAPIEvent(request));
      const json = await response.json();

      expect(json.snapshots).toHaveLength(1);
      expect(json.snapshots[0].timestamp).toBe(1000);
    });

    it("returns empty array for nonexistent vault", async () => {
      const request = makeRequest(
        `/api/sync/snapshots/list?vaultPath=nonexistent-vault`
      );
      const response = await listGET(makeAPIEvent(request));
      const json = await response.json();

      expect(json.snapshots).toEqual([]);
    });
  });

  describe("GET /api/sync/snapshots/download/:key", () => {
    it("returns the snapshot blob", async () => {
      const snapshotDir = join(STORAGE_ROOT, TEST_VAULT, "snapshots");
      await mkdir(snapshotDir, { recursive: true });
      const blob = Buffer.from([10, 20, 30, 40, 50]);
      await writeFile(join(snapshotDir, "1000-device1.snapshot.bin"), blob);

      const key = `${TEST_VAULT}/snapshots/1000-device1.snapshot.bin`;
      const request = makeRequest(`/api/sync/snapshots/download/${key}`);
      const response = await downloadGET(makeAPIEvent(request, { key }));

      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toBe(
        "application/octet-stream"
      );

      const data = new Uint8Array(await response.arrayBuffer());
      expect(data).toEqual(new Uint8Array(blob));
    });

    it("returns 404 for nonexistent snapshot", async () => {
      const key = `${TEST_VAULT}/snapshots/9999-nodevice.snapshot.bin`;
      const request = makeRequest(`/api/sync/snapshots/download/${key}`);
      const response = await downloadGET(makeAPIEvent(request, { key }));
      expect(response.status).toBe(404);
    });

    it("rejects non-.snapshot.bin keys", async () => {
      const key = `${TEST_VAULT}/snapshots/1000-device1.bin`;
      const request = makeRequest(`/api/sync/snapshots/download/${key}`);
      const response = await downloadGET(makeAPIEvent(request, { key }));
      expect(response.status).toBe(400);
    });
  });

  describe("Full snapshot cycle", () => {
    it("upload → list → download returns same data", async () => {
      const originalData = new Uint8Array([99, 88, 77, 66, 55]);

      // Upload
      const uploadReq = makeRequest("/api/sync/snapshots/upload", {
        method: "POST",
        headers: {
          "X-Vault-Path": TEST_VAULT,
          "X-Device-Id": "device-A",
        },
        body: originalData,
      });
      const uploadRes = await POST(makeAPIEvent(uploadReq));
      const { key, timestamp } = await uploadRes.json();

      // List
      const listReq = makeRequest(
        `/api/sync/snapshots/list?vaultPath=${TEST_VAULT}`
      );
      const listRes = await listGET(makeAPIEvent(listReq));
      const { snapshots } = await listRes.json();

      expect(snapshots).toHaveLength(1);
      expect(snapshots[0].key).toBe(key);
      expect(snapshots[0].timestamp).toBe(timestamp);

      // Download
      const dlReq = makeRequest(`/api/sync/snapshots/download/${key}`);
      const dlRes = await downloadGET(makeAPIEvent(dlReq, { key }));
      const downloaded = new Uint8Array(await dlRes.arrayBuffer());

      expect(downloaded).toEqual(originalData);
    });
  });
});
