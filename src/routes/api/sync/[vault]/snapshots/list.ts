import { type APIEvent } from "@solidjs/start/server";
import { readdir } from "node:fs/promises";
import { resolveVaultFilePath } from "../../_storage";

export async function GET(event: APIEvent) {
  const vault = event.params.vault;
  const snapshotDir = resolveVaultFilePath(vault, "snapshots");

  if (!snapshotDir) {
    return new Response("Invalid vault path", { status: 400 });
  }

  let files: string[];
  try {
    files = await readdir(snapshotDir);
  } catch {
    return Response.json({ snapshots: [] });
  }

  const snapshots = files
    .filter((filename) => filename.endsWith(".snapshot.bin"))
    .map((filename) => ({
      key: filename,
      timestamp: Number.parseInt(filename.split("-")[0] ?? "", 10),
    }))
    .filter((entry) => !Number.isNaN(entry.timestamp))
    .sort((left, right) => left.timestamp - right.timestamp);

  return Response.json({ snapshots });
}
