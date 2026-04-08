import { type APIEvent } from "@solidjs/start/server";
import { readdir } from "node:fs/promises";
import { resolveVaultPath } from "../_storage";

export async function GET(event: APIEvent) {
  const vault = event.params.vault;
  const vaultDir = resolveVaultPath(vault);
  const afterParam = new URL(event.request.url).searchParams.get("after");

  if (!vaultDir) {
    return new Response("Invalid vault path", { status: 400 });
  }

  const after = afterParam ? Number.parseInt(afterParam, 10) : null;

  let files: string[];
  try {
    files = await readdir(vaultDir);
  } catch {
    return Response.json({ changesets: [] });
  }

  const changesets = files
    .filter((filename) => filename.endsWith(".bin"))
    .map((filename) => ({
      key: filename,
      timestamp: Number.parseInt(filename.split("-")[0] ?? "", 10),
    }))
    .filter((entry) => !Number.isNaN(entry.timestamp))
    .filter((entry) => (after === null ? true : entry.timestamp > after))
    .sort((left, right) => left.timestamp - right.timestamp);

  return Response.json({ changesets });
}
