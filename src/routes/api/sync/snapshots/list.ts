import { type APIEvent } from "@solidjs/start/server";
import { readdir } from "node:fs/promises";
import { join, resolve } from "node:path";

const STORAGE_ROOT = resolve("./storage/vaults");

export async function GET(event: APIEvent) {
  const url = new URL(event.request.url);
  const vaultPath = url.searchParams.get("vaultPath");

  if (!vaultPath) {
    return new Response("Missing vaultPath parameter", { status: 400 });
  }

  const snapshotDir = join(STORAGE_ROOT, vaultPath, "snapshots");

  if (!resolve(snapshotDir).startsWith(STORAGE_ROOT)) {
    return new Response("Invalid vault path", { status: 400 });
  }

  let files: string[];
  try {
    files = await readdir(snapshotDir);
  } catch {
    return Response.json({ snapshots: [] });
  }

  const snapshots = files
    .filter((f) => f.endsWith(".snapshot.bin"))
    .map((f) => {
      const timestamp = parseInt(f.split("-")[0], 10);
      return { key: `${vaultPath}/snapshots/${f}`, timestamp };
    })
    .filter((s) => !isNaN(s.timestamp))
    .sort((a, b) => a.timestamp - b.timestamp);

  return Response.json({ snapshots });
}
