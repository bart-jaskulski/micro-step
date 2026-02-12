import { type APIEvent } from "@solidjs/start/server";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const STORAGE_ROOT = resolve("./storage/vaults");

export async function GET(event: APIEvent) {
  const key = event.params.key;

  if (!key) {
    return new Response("Missing key", { status: 400 });
  }

  const filePath = join(STORAGE_ROOT, key);

  if (!resolve(filePath).startsWith(STORAGE_ROOT)) {
    return new Response("Invalid key", { status: 400 });
  }

  if (!key.endsWith(".snapshot.bin")) {
    return new Response("Invalid key format", { status: 400 });
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
