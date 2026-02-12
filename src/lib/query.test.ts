import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { MAIN_VIEW_QUERY } from "./query";

let db: InstanceType<typeof Database>;

const CREATE_TABLE = `
  CREATE TABLE tasks (
    id TEXT PRIMARY KEY,
    parent_id TEXT,
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
  overrides: Record<string, any> = {},
) => {
  const defaults = {
    parent_id: null,
    text: `Task ${id}`,
    completed: 0,
    created_at: now,
    updated_at: now,
    due_at: null,
    rank: `0|${id}:`,
  };
  const row = { id, ...defaults, ...overrides };
  db.prepare(
    `INSERT INTO tasks (id, parent_id, text, completed, created_at, updated_at, due_at, rank)
     VALUES (@id, @parent_id, @text, @completed, @created_at, @updated_at, @due_at, @rank)`,
  ).run(row);
};

beforeEach(() => {
  db = new Database(":memory:");
  db.exec(CREATE_TABLE);
});

afterEach(() => {
  db.close();
});

describe("MAIN_VIEW_QUERY ordering", () => {
  it("stalled tasks appear before non-stalled incomplete tasks", () => {
    insert("stalled", { created_at: eightDaysAgo, updated_at: eightDaysAgo, rank: "0|bbb:" });
    insert("active", { rank: "0|aaa:" });

    const rows = db.prepare(MAIN_VIEW_QUERY).all() as any[];
    expect(rows[0].id).toBe("stalled");
    expect(rows[0].is_stalled).toBe(1);
    expect(rows[1].id).toBe("active");
    expect(rows[1].is_stalled).toBe(0);
  });

  it("completed tasks appear after incomplete tasks", () => {
    insert("done", { completed: 1, rank: "0|aaa:" });
    insert("todo", { completed: 0, rank: "0|bbb:" });

    const rows = db.prepare(MAIN_VIEW_QUERY).all() as any[];
    expect(rows[0].id).toBe("todo");
    expect(rows[1].id).toBe("done");
  });

  it("sibling order follows rank within stalled/non-stalled groups", () => {
    insert("b", { rank: "0|bbb:" });
    insert("a", { rank: "0|aaa:" });
    insert("stalled-b", { created_at: eightDaysAgo, updated_at: eightDaysAgo, rank: "0|sbb:" });
    insert("stalled-a", { created_at: eightDaysAgo, updated_at: eightDaysAgo, rank: "0|saa:" });

    const rows = db.prepare(MAIN_VIEW_QUERY).all() as any[];
    const ids = rows.map((r: any) => r.id);
    expect(ids).toEqual(["stalled-a", "stalled-b", "a", "b"]);
  });

  it("subtask hierarchy is preserved via parent_id grouping", () => {
    insert("parent", { rank: "0|aaa:" });
    insert("child-b", { parent_id: "parent", rank: "0|bbb:" });
    insert("child-a", { parent_id: "parent", rank: "0|aaa:" });
    insert("root-b", { rank: "0|bbb:" });

    const rows = db.prepare(MAIN_VIEW_QUERY).all() as any[];
    const ids = rows.map((r: any) => r.id);
    // Root tasks (parent_id NULL) sort first, then children grouped by parent_id
    expect(ids.indexOf("parent")).toBeLessThan(ids.indexOf("child-a"));
    expect(ids.indexOf("child-a")).toBeLessThan(ids.indexOf("child-b"));
  });
});
