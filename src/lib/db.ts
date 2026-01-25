import initWasm from "@vlcn.io/crsqlite-wasm";
import { isServer } from "solid-js/web";

type DB = any;

let db: DB | null = null;
let initPromise: Promise<DB> | null = null;

const isOpfsSupported = () => {
  return !isServer && 'showOpenFilePicker' in window;
};

const initializeDb = async (): Promise<DB> => {
  if (isServer) {
    throw new Error("Database cannot be initialized on the server");
  }

  if (db) return db;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      const sqlite = await initWasm();

      if (isOpfsSupported()) {
        console.log("Using OPFS for database storage");
        db = sqlite.open("microstep.db");
      } else {
        console.log("OPFS not supported; falling back to IndexedDB storage");
        db = sqlite.open("microstep.db");
      }

      return db as DB;
    } catch (err) {
      initPromise = null;
      throw err;
    }
  })();

  return initPromise;
};

export const getDb = async () => {
  if (!db) {
    await initializeDb();
  }
  return db;
};

export const initSchema = async () => {
  const database = await getDb();
  
  database.exec(`
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT NOT NULL PRIMARY KEY DEFAULT '',
      parent_id TEXT,
      text TEXT NOT NULL DEFAULT '',
      completed INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT 0,
      due_at INTEGER,
      rank TEXT NOT NULL DEFAULT '',
      site_id BLOB,
      is_deleted INTEGER NOT NULL DEFAULT 0
    );

    SELECT crsql_as_crr('tasks');
  `);

  const tables = await database.execO(`
    SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'crsql_%';
  `);

  if (tables.length === 0) {
    console.log("Database initialized with empty tasks table");
  } else {
    console.log("Database schema already initialized");
  }

  const columns = await database.execO(`
    PRAGMA table_info(tasks);
  `);

  const hasIsDeleted = columns.some((col: any) => col.name === 'is_deleted');

  if (!hasIsDeleted) {
    database.exec("ALTER TABLE tasks ADD COLUMN is_deleted INTEGER NOT NULL DEFAULT 0");
    console.log("Added is_deleted column to existing tasks table");
  }
};

export const closeDb = () => {
  if (db) {
    db.close();
    db = null;
    initPromise = null;
  }
};
