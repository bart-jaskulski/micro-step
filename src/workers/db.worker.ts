import initWasm from "@vlcn.io/crsqlite-wasm";
import type { DbRequest, DbResponse } from "../lib/db.types";

let db: any = null;

const DEFAULT_WORKSPACE_ID = "default";
const DEFAULT_WORKSPACE_NAME = "Default";

const ensureTaskTable = async () => {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT NOT NULL PRIMARY KEY DEFAULT '',
      parent_id TEXT,
      text TEXT NOT NULL DEFAULT '',
      completed INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER,
      due_at INTEGER,
      rank TEXT NOT NULL DEFAULT '',
      workspace_id TEXT,
      site_id BLOB
    );
  `);
};

const ensureTaskWorkspaceColumn = async () => {
  const columns = await db.execO("PRAGMA table_info(tasks)");
  const hasWorkspaceId = Array.isArray(columns)
    && columns.some((column: { name?: string }) => column.name === "workspace_id");

  if (hasWorkspaceId) {
    return;
  }

  await db.exec(`
    SELECT crsql_begin_alter('tasks');
    ALTER TABLE tasks ADD COLUMN workspace_id TEXT;
    SELECT crsql_commit_alter('tasks');
  `);
};

const ensureWorkspaceTable = async () => {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS workspaces (
      id TEXT NOT NULL PRIMARY KEY DEFAULT '',
      name TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL DEFAULT 0,
      site_id BLOB
    );

    SELECT crsql_as_crr('workspaces');
  `);
};

const ensureDefaultWorkspace = async () => {
  const now = Date.now();

  await db.exec(
    "INSERT OR IGNORE INTO workspaces (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)",
    [DEFAULT_WORKSPACE_ID, DEFAULT_WORKSPACE_NAME, now, now]
  );
  await db.exec("UPDATE tasks SET updated_at = created_at WHERE updated_at IS NULL");
  await db.exec(
    "UPDATE tasks SET workspace_id = ? WHERE workspace_id IS NULL OR workspace_id = ''",
    [DEFAULT_WORKSPACE_ID]
  );
};

const ensureSchema = async () => {
  await ensureTaskTable();
  await db.exec("SELECT crsql_as_crr('tasks')");
  await ensureTaskWorkspaceColumn();
  await ensureWorkspaceTable();
  await ensureDefaultWorkspace();
};

const initDb = async () => {
  const sqlite = await initWasm();
  db = await sqlite.open("microstep.db");
  console.log(db)

  await ensureSchema();
};

self.onmessage = async (event: MessageEvent<DbRequest>) => {
  const msg = event.data;

  try {
    switch (msg.type) {
      case 'init': {
        await initDb();
        self.postMessage({ id: msg.id, type: 'success' } as DbResponse);
        break;
      }
      case 'exec': {
        await db.exec(msg.sql, msg.params);
        self.postMessage({ id: msg.id, type: 'success' } as DbResponse);
        self.postMessage({ type: 'change', table: 'tasks' } as DbResponse);
        break;
      }
      case 'query': {
        const rows = await db.execO(msg.sql, msg.params);
        self.postMessage({ id: msg.id, type: 'success', data: { rows } } as DbResponse);
        break;
      }
      case 'export': {
        const exported = db.export();
        self.postMessage({ id: msg.id, type: 'success', data: { bytes: exported } } as DbResponse);
        break;
      }
      case 'import': {
        const sqlite = await initWasm();
        if (db) await db.close();
        db = await sqlite.open("microstep.db", new Uint8Array(msg.data));
        await ensureSchema();
        self.postMessage({ id: msg.id, type: 'success' } as DbResponse);
        self.postMessage({ type: 'change', table: 'tasks' } as DbResponse);
        break;
      }
    }
  } catch (err: any) {
    if ('id' in msg) {
      self.postMessage({
        id: msg.id,
        type: 'error',
        message: err.message || String(err),
      } as DbResponse);
    }
  }
};
