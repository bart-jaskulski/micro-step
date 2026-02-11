import initWasm from "@vlcn.io/crsqlite-wasm";
import type { DbRequest, DbResponse } from "../lib/db.types";

let db: any = null;

const initDb = async () => {
  const sqlite = await initWasm();
  db = await sqlite.open("microstep.db");

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
      site_id BLOB
    );

    SELECT crsql_as_crr('tasks');

    UPDATE tasks SET updated_at = created_at WHERE updated_at IS NULL;
  `);
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
