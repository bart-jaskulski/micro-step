import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { MAIN_VIEW_QUERY } from "./query";

let db: InstanceType<typeof Database>;

type TaskRow = {
  id: string;
  parent_id: string | null;
  workspace_id: string;
  text: string;
  completed: number;
  created_at: number;
  updated_at: number;
  due_at: number | null;
  rank: string;
};

type QueryRow = {
  id: string;
};

const CREATE_TABLE = `
  CREATE TABLE tasks (
    id TEXT PRIMARY KEY,
    parent_id TEXT,
    workspace_id TEXT NOT NULL,
    text TEXT NOT NULL,
    completed INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    due_at INTEGER,
    rank TEXT NOT NULL
  )
`;

const DAY = 24 * 60 * 60 * 1000;
const now = Date.now();
const eightDaysAgo = now - 8 * DAY;

const insert = (
  id: string,
  overrides: Partial<TaskRow> = {},
) => {
  const defaults = {
    parent_id: null,
    workspace_id: "default",
    text: `Task ${id}`,
    completed: 0,
    created_at: now,
    updated_at: now,
    due_at: null,
    rank: `0|${id}:`,
  };
  const row = { id, ...defaults, ...overrides };
  db.prepare(
    `INSERT INTO tasks (id, parent_id, workspace_id, text, completed, created_at, updated_at, due_at, rank)
     VALUES (@id, @parent_id, @workspace_id, @text, @completed, @created_at, @updated_at, @due_at, @rank)`,
  ).run(row);
};

beforeEach(() => {
  db = new Database(":memory:");
  db.exec(CREATE_TABLE);
});

afterEach(() => {
  db?.close();
});

describe("MAIN_VIEW_QUERY ordering", () => {
  it("orders tasks by due date descending with undated tasks last", () => {
    insert("later", { due_at: now + DAY });
    insert("earlier", { due_at: now - DAY });
    insert("undated", { due_at: null });

    const rows = db.prepare(MAIN_VIEW_QUERY).all("default") as QueryRow[];
    expect(rows.map((row) => row.id)).toEqual(["later", "earlier", "undated"]);
  });

  it("uses created_at descending when due dates match", () => {
    insert("newer", { due_at: now + DAY, created_at: now + 1000, updated_at: now + 1000 });
    insert("older", { due_at: now + DAY, created_at: now, updated_at: now });

    const rows = db.prepare(MAIN_VIEW_QUERY).all("default") as QueryRow[];
    expect(rows.map((row) => row.id)).toEqual(["newer", "older"]);
  });

  it("falls back to rank when due date and created_at match", () => {
    insert("b", { due_at: now + DAY, created_at: eightDaysAgo, updated_at: eightDaysAgo, rank: "0|bbb:" });
    insert("a", { due_at: now + DAY, created_at: eightDaysAgo, updated_at: eightDaysAgo, rank: "0|aaa:" });

    const rows = db.prepare(MAIN_VIEW_QUERY).all("default") as QueryRow[];
    expect(rows.map((row) => row.id)).toEqual(["a", "b"]);
  });
});
