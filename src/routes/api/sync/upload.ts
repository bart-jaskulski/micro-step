import { type APIEvent } from "@solidjs/start/server";
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const STORAGE_ROOT = resolve("./storage/vaults");

export async function POST(event: APIEvent) {
  const request = event.request;
  const vaultPath = request.headers.get("x-vault-path");
  const deviceId = request.headers.get("x-device-id");

  if (!vaultPath || !deviceId) {
    return new Response("Missing X-Vault-Path or X-Device-Id header", {
      status: 400,
    });
  }

  const timestamp = Date.now();
  const filename = `${timestamp}-${deviceId}.bin`;
  const vaultDir = join(STORAGE_ROOT, vaultPath);
  const filePath = join(vaultDir, filename);

  // Path traversal check
  if (!resolve(filePath).startsWith(STORAGE_ROOT)) {
    return new Response("Invalid vault path", { status: 400 });
  }

  const body = await request.arrayBuffer();
  if (!body || body.byteLength === 0) {
    return new Response("Empty body", { status: 400 });
  }

  await mkdir(vaultDir, { recursive: true });
  await writeFile(filePath, Buffer.from(body));

  const key = `${vaultPath}/${filename}`;
  return Response.json({ key, timestamp });
}
