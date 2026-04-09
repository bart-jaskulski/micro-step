import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdir, writeFile, readFile, readdir, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { POST } from "../[vault]/upload";
import { GET as listGET } from "../[vault]/list";
import { GET as downloadGET } from "../[vault]/download/[filename]";
import {
  CHANGESET_UPLOAD_MAX_BYTES,
  MAX_CHANGESETS_PER_VAULT,
} from "../_security";
import { resetRateLimitStore } from "~/lib/requestSecurity";

const STORAGE_ROOT = resolve("./storage/vaults");
const TEST_VAULT = "test-vault-abc123";
const TEST_DEVICE = "device-001";

function makeRequest(url: string, init?: RequestInit): Request {
  return new Request(new URL(url, "http://localhost:3000"), init);
}

function makeAPIEvent(request: Request, params: Record<string, string> = {}) {
  return { request, params } as any;
}

describe("Sync API Endpoints", () => {
  beforeEach(async () => {
    resetRateLimitStore();
    await rm(join(STORAGE_ROOT, TEST_VAULT), { recursive: true, force: true });
  });

  afterEach(async () => {
    resetRateLimitStore();
    await rm(join(STORAGE_ROOT, TEST_VAULT), { recursive: true, force: true });
  });

  describe("POST /api/sync/:vault/upload", () => {
    it("stores uploaded blob and returns key + timestamp", async () => {
      const body = new Uint8Array([1, 2, 3, 4, 5]);
      const request = makeRequest(`/api/sync/${TEST_VAULT}/upload`, {
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
      expect(json.key).toContain(TEST_DEVICE);
      expect(json.key).toMatch(/\.bin$/);
      expect(typeof json.timestamp).toBe("number");

      // Verify file exists on disk
      const files = await readdir(join(STORAGE_ROOT, TEST_VAULT));
      expect(files.length).toBe(1);
      expect(files[0]).toMatch(/\.bin$/);

      const fileData = await readFile(join(STORAGE_ROOT, TEST_VAULT, files[0]));
      expect(new Uint8Array(fileData)).toEqual(body);
    });

    it("returns 400 when missing headers", async () => {
      const request = makeRequest(`/api/sync/${TEST_VAULT}/upload`, {
        method: "POST",
        body: new Uint8Array([1]),
      });

      const response = await POST(makeAPIEvent(request, { vault: TEST_VAULT }));
      expect(response.status).toBe(400);
    });

    it("rejects oversized uploads with 413", async () => {
      const body = new Uint8Array(CHANGESET_UPLOAD_MAX_BYTES + 1);
      const request = makeRequest(`/api/sync/${TEST_VAULT}/upload`, {
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

    it("rate limits repeated writes and recovers after the window resets", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2025-01-01T00:00:00Z"));

      try {
        for (let attempt = 0; attempt < 30; attempt += 1) {
          const request = makeRequest(`/api/sync/${TEST_VAULT}/upload`, {
            method: "POST",
            headers: {
              "X-Device-Id": TEST_DEVICE,
              "user-agent": "vitest",
              "x-forwarded-for": "198.51.100.10",
            },
            body: new Uint8Array([attempt]),
          });

          const response = await POST(makeAPIEvent(request, { vault: TEST_VAULT }));
          expect(response.status).toBe(200);
          vi.advanceTimersByTime(1);
        }

        const limitedRequest = makeRequest(`/api/sync/${TEST_VAULT}/upload`, {
          method: "POST",
          headers: {
            "X-Device-Id": TEST_DEVICE,
            "user-agent": "vitest",
            "x-forwarded-for": "198.51.100.10",
          },
          body: new Uint8Array([31]),
        });

        const limitedResponse = await POST(makeAPIEvent(limitedRequest, { vault: TEST_VAULT }));
        expect(limitedResponse.status).toBe(429);

        vi.advanceTimersByTime(60_001);

        const recoveredRequest = makeRequest(`/api/sync/${TEST_VAULT}/upload`, {
          method: "POST",
          headers: {
            "X-Device-Id": TEST_DEVICE,
            "user-agent": "vitest",
            "x-forwarded-for": "198.51.100.10",
          },
          body: new Uint8Array([32]),
        });

        const recoveredResponse = await POST(makeAPIEvent(recoveredRequest, { vault: TEST_VAULT }));
        expect(recoveredResponse.status).toBe(200);
      } finally {
        vi.useRealTimers();
      }
    });

    it("prunes the oldest changesets once the vault exceeds the configured limit", async () => {
      const vaultDir = join(STORAGE_ROOT, TEST_VAULT);
      await mkdir(vaultDir, { recursive: true });

      for (let index = 1; index <= MAX_CHANGESETS_PER_VAULT; index += 1) {
        await writeFile(join(vaultDir, `${index}-${TEST_DEVICE}.bin`), Buffer.from([index % 255]));
      }

      const request = makeRequest(`/api/sync/${TEST_VAULT}/upload`, {
        method: "POST",
        headers: {
          "X-Device-Id": TEST_DEVICE,
        },
        body: new Uint8Array([9, 9, 9]),
      });

      const response = await POST(makeAPIEvent(request, { vault: TEST_VAULT }));
      expect(response.status).toBe(200);

      const files = (await readdir(vaultDir)).filter((filename) => filename.endsWith(".bin"));
      expect(files).toHaveLength(MAX_CHANGESETS_PER_VAULT);
      expect(files).not.toContain(`1-${TEST_DEVICE}.bin`);
    });
  });

  describe("GET /api/sync/:vault/list", () => {
    it("returns changesets for a vault", async () => {
      // Create test files
      const vaultDir = join(STORAGE_ROOT, TEST_VAULT);
      await mkdir(vaultDir, { recursive: true });
      await writeFile(join(vaultDir, "1000-device1.bin"), Buffer.from([1]));
      await writeFile(join(vaultDir, "2000-device1.bin"), Buffer.from([2]));

      const request = makeRequest(`/api/sync/${TEST_VAULT}/list`);
      const response = await listGET(makeAPIEvent(request, { vault: TEST_VAULT }));
      expect(response.status).toBe(200);

      const json = await response.json();
      expect(json.changesets).toHaveLength(2);
      expect(json.changesets[0].timestamp).toBe(1000);
      expect(json.changesets[1].timestamp).toBe(2000);
      expect(json.changesets[0].key).toBe("1000-device1.bin");
    });

    it("filters changesets with after parameter", async () => {
      const vaultDir = join(STORAGE_ROOT, TEST_VAULT);
      await mkdir(vaultDir, { recursive: true });
      await writeFile(join(vaultDir, "1000-device1.bin"), Buffer.from([1]));
      await writeFile(join(vaultDir, "2000-device1.bin"), Buffer.from([2]));
      await writeFile(join(vaultDir, "3000-device1.bin"), Buffer.from([3]));

      const request = makeRequest(`/api/sync/${TEST_VAULT}/list?after=1000`);
      const response = await listGET(makeAPIEvent(request, { vault: TEST_VAULT }));
      const json = await response.json();

      expect(json.changesets).toHaveLength(2);
      expect(json.changesets[0].timestamp).toBe(2000);
      expect(json.changesets[1].timestamp).toBe(3000);
    });

    it("returns empty array for nonexistent vault", async () => {
      const request = makeRequest("/api/sync/nonexistent-vault/list");
      const response = await listGET(makeAPIEvent(request, { vault: "nonexistent-vault" }));
      const json = await response.json();

      expect(json.changesets).toEqual([]);
    });
  });

  describe("GET /api/sync/:vault/download/:filename", () => {
    it("returns the encrypted blob", async () => {
      const vaultDir = join(STORAGE_ROOT, TEST_VAULT);
      await mkdir(vaultDir, { recursive: true });
      const blob = Buffer.from([10, 20, 30, 40, 50]);
      await writeFile(join(vaultDir, "1000-device1.bin"), blob);

      const filename = "1000-device1.bin";
      const request = makeRequest(`/api/sync/${TEST_VAULT}/download/${filename}`);
      const response = await downloadGET(makeAPIEvent(request, { vault: TEST_VAULT, filename }));

      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toBe(
        "application/octet-stream"
      );

      const data = new Uint8Array(await response.arrayBuffer());
      expect(data).toEqual(new Uint8Array(blob));
    });

    it("returns 404 for nonexistent key", async () => {
      const filename = "9999-nodevice.bin";
      const request = makeRequest(`/api/sync/${TEST_VAULT}/download/${filename}`);
      const response = await downloadGET(makeAPIEvent(request, { vault: TEST_VAULT, filename }));
      expect(response.status).toBe(404);
    });
  });

  describe("Full sync cycle", () => {
    it("upload → list → download returns same data", async () => {
      const originalData = new Uint8Array([99, 88, 77, 66, 55]);

      // Upload
      const uploadReq = makeRequest(`/api/sync/${TEST_VAULT}/upload`, {
        method: "POST",
        headers: {
          "X-Device-Id": "device-A",
        },
        body: originalData,
      });
      const uploadRes = await POST(makeAPIEvent(uploadReq, { vault: TEST_VAULT }));
      const { key, timestamp } = await uploadRes.json();

      // List
      const listReq = makeRequest(`/api/sync/${TEST_VAULT}/list`);
      const listRes = await listGET(makeAPIEvent(listReq, { vault: TEST_VAULT }));
      const { changesets } = await listRes.json();

      expect(changesets).toHaveLength(1);
      expect(changesets[0].key).toBe(key);
      expect(changesets[0].timestamp).toBe(timestamp);

      // Download
      const dlReq = makeRequest(`/api/sync/${TEST_VAULT}/download/${key}`);
      const dlRes = await downloadGET(makeAPIEvent(dlReq, { vault: TEST_VAULT, filename: key }));
      const downloaded = new Uint8Array(await dlRes.arrayBuffer());

      expect(downloaded).toEqual(originalData);
    });
  });
});
