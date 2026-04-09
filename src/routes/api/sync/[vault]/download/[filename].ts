import { type APIEvent } from "@solidjs/start/server";
import { readFile } from "node:fs/promises";
import { resolveVaultFilePath } from "../../_storage";
import { enforceSyncRateLimit } from "../../_security";

export async function GET(event: APIEvent) {
  const rateLimitResponse = enforceSyncRateLimit(event.request, event.clientAddress, "read");
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  const vault = event.params.vault;
  const filename = event.params.filename;

  if (!vault || !filename) {
    return new Response("Missing vault or filename", { status: 400 });
  }

  if (!filename.endsWith(".bin")) {
    return new Response("Invalid filename format", { status: 400 });
  }

  const filePath = resolveVaultFilePath(vault, filename);
  if (!filePath) {
    return new Response("Invalid vault path", { status: 400 });
  }

  try {
    const data = await readFile(filePath);
    return new Response(data, {
      headers: { "content-type": "application/octet-stream" },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
