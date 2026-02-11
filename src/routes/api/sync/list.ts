import { type APIEvent } from "@solidjs/start/server";
import { readdir } from "node:fs/promises";
import { join, resolve } from "node:path";

const STORAGE_ROOT = resolve("./storage/vaults");

export async function GET(event: APIEvent) {
  const url = new URL(event.request.url);
  const vaultPath = url.searchParams.get("vaultPath");
  const afterParam = url.searchParams.get("after");

  if (!vaultPath) {
    return new Response("Missing vaultPath parameter", { status: 400 });
  }

  const vaultDir = join(STORAGE_ROOT, vaultPath);

  // Path traversal check
  if (!resolve(vaultDir).startsWith(STORAGE_ROOT)) {
    return new Response("Invalid vault path", { status: 400 });
  }

  const after = afterParam ? parseInt(afterParam, 10) : null;

  let files: string[];
  try {
    files = await readdir(vaultDir);
  } catch {
    return Response.json({ changesets: [] });
  }

  const changesets = files
    .filter((f) => f.endsWith(".bin"))
    .map((f) => {
      const timestamp = parseInt(f.split("-")[0], 10);
      return { key: `${vaultPath}/${f}`, timestamp };
    })
    .filter((c) => !isNaN(c.timestamp))
    .filter((c) => (after ? c.timestamp > after : true))
    .sort((a, b) => a.timestamp - b.timestamp);

  return Response.json({ changesets });
}
