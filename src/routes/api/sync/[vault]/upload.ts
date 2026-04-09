import { type APIEvent } from "@solidjs/start/server";
import { mkdir, writeFile } from "node:fs/promises";
import { resolveVaultFilePath, resolveVaultPath } from "../_storage";
import {
  CHANGESET_UPLOAD_MAX_BYTES,
  enforceSyncRateLimit,
  pruneVaultChangesets,
  readRequestBodyWithinLimit,
} from "../_security";

export async function POST(event: APIEvent) {
  const rateLimitResponse = enforceSyncRateLimit(event.request, event.clientAddress, "write");
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  const vault = event.params.vault;
  const deviceId = event.request.headers.get("x-device-id");

  if (!vault || !deviceId) {
    return new Response("Missing vault path or X-Device-Id header", { status: 400 });
  }

  const vaultDir = resolveVaultPath(vault);
  if (!vaultDir) {
    return new Response("Invalid vault path", { status: 400 });
  }

  const timestamp = Date.now();
  const filename = `${timestamp}-${deviceId}.bin`;
  const filePath = resolveVaultFilePath(vault, filename);

  if (!filePath) {
    return new Response("Invalid vault path", { status: 400 });
  }

  const bodyResult = await readRequestBodyWithinLimit(event.request, CHANGESET_UPLOAD_MAX_BYTES);
  if (!bodyResult.ok) {
    return bodyResult.response;
  }

  if (bodyResult.body.byteLength === 0) {
    return new Response("Empty body", { status: 400 });
  }

  await mkdir(vaultDir, { recursive: true });
  await writeFile(filePath, Buffer.from(bodyResult.body));
  await pruneVaultChangesets(vaultDir);

  return Response.json({ key: filename, timestamp });
}
