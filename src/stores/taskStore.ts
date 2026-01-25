import { createMemo, createRoot, onCleanup } from "solid-js";
import { createStore } from "solid-js/store";
import { isServer } from "solid-js/web";
import { LexoRank } from "lexorank";
import { getDb, initSchema } from "~/lib/db";
import tblrx from "@vlcn.io/rx-tbl";

const nanoid = () => {
  const array = new Uint8Array(16);

  crypto.getRandomValues(array);
  return Array.from(array, byte => ('0' + byte.toString(16)).slice(-2)).join('');
}

export type Task = {
  id: string;
  parentId: string | null;
  text: string;
  completed: boolean;
  createdAt: number;
  dueAt: number | null;
  rank: string;
  isDeleted: boolean;
};

export type TreeNode = Task & {
  children: TreeNode[];
  effectiveDueDate: number | null;
};

const dbRowToTask = (row: any): Task => ({
  id: row.id,
  parentId: row.parent_id,
  text: row.text,
  completed: Boolean(row.completed),
  createdAt: row.created_at,
  dueAt: row.due_at,
  rank: row.rank,
  isDeleted: Boolean(row.is_deleted),
});

const compareDueThenRank = (a: Task, b: Task) => {
  const aDue = a.dueAt ?? Number.POSITIVE_INFINITY;
  const bDue = b.dueAt ?? Number.POSITIVE_INFINITY;
  if (aDue !== bDue) return aDue - bDue;
  return a.rank.localeCompare(b.rank);
};

const computeInitialRank = async (parentId: string | null, dueAt: number | null) => {
  const db = await getDb();
  
  let rows: any[];
  if (parentId) {
    rows = await db.execO("SELECT * FROM tasks WHERE parent_id = ? AND is_deleted = 0", [parentId]);
  } else {
    rows = await db.execO("SELECT * FROM tasks WHERE parent_id IS NULL AND is_deleted = 0");
  }

  if (!rows || !Array.isArray(rows) || rows.length === 0) {
    return LexoRank.middle().toString();
  }

  const siblings = rows.map(dbRowToTask);

  const sorted = siblings.slice().sort(compareDueThenRank);
  const targetIndex = sorted.findIndex((sibling) => {
    const siblingDue = sibling.dueAt ?? Number.POSITIVE_INFINITY;
    const currentDue = dueAt ?? Number.POSITIVE_INFINITY;
    return currentDue < siblingDue;
  });

  const insertIndex = targetIndex === -1 ? sorted.length : targetIndex;
  const prev = sorted[insertIndex - 1];
  const next = sorted[insertIndex];

  if (!prev && !next) {
    return LexoRank.middle().toString();
  }
  if (!prev && next) {
    return LexoRank.parse(next.rank).genPrev().toString();
  }
  if (prev && !next) {
    return LexoRank.parse(prev.rank).genNext().toString();
  }
  return LexoRank.parse(prev.rank).between(LexoRank.parse(next.rank)).toString();
};

const taskStore = createRoot(() => {
  const [state, setState] = createStore({
    tasks: {} as Record<string, Task>,
    isSynced: false,
  });

  let rxDisposer: (() => void) | null = null;

  const refreshTasks = async () => {
    const db = await getDb();
    const rows = await db.execO("SELECT * FROM tasks WHERE is_deleted = 0");
    console.log("[client] refreshTasks - fetched rows", rows);
    const taskMap: Record<string, Task> = {};
    
    if (Array.isArray(rows)) {
      rows.forEach((row: any) => {
        const task = dbRowToTask(row);
        taskMap[task.id] = task;
      });
    }
    
    setState("tasks", taskMap);
    console.log("[client] refreshTasks", { count: Object.keys(taskMap).length });
  };

  const setupReactiveQueries = async () => {
    if (isServer || rxDisposer) return;

    const db = await getDb();
    const rx = tblrx(db);

    rxDisposer = rx.onRange(["tasks"], (updateTypes) => {
      console.log("[client] Reactive update triggered for tasks table", updateTypes);
      void refreshTasks();
    });

    console.log("[client] Reactive queries setup complete");
  };

  const cleanupReactiveQueries = () => {
    if (rxDisposer) {
      rxDisposer();
      rxDisposer = null;
      console.log("[client] Reactive queries cleaned up");
    }
  };

  const initializeTaskStore = async () => {
    if (isServer) return;

    try {
      await initSchema();
      await refreshTasks();
      await setupReactiveQueries();
      setState("isSynced", true);
    } catch (err) {
      console.error("Failed to initialize task store:", err);
    }
  };

  const tasks = createMemo(() => {
    const tasks = Object.values(state.tasks);
    const nodeMap = new Map<string, TreeNode>();

    tasks.forEach(t => {
      nodeMap.set(t.id, { ...t, children: [], effectiveDueDate: t.dueAt });
    });

    const roots: TreeNode[] = [];

    tasks.forEach(t => {
      const node = nodeMap.get(t.id)!;
      if (t.parentId && nodeMap.has(t.parentId)) {
        nodeMap.get(t.parentId)!.children.push(node);
      } else {
        roots.push(node);
      }
    });

    const processNode = (node: TreeNode): number | null => {
      let minChildDate: number | null = null;

      node.children.forEach(child => {
        const childDate = processNode(child);

        if (childDate !== null) {
          if (minChildDate === null || childDate < minChildDate) {
            minChildDate = childDate;
          }
        }
      });

      if (node.dueAt !== null) {
        node.effectiveDueDate = minChildDate !== null 
          ? Math.min(node.dueAt, minChildDate) 
          : node.dueAt;
      } else {
        node.effectiveDueDate = minChildDate;
      }

      node.children.sort((a, b) => {
        return a.rank.localeCompare(b.rank);
      });

      return node.effectiveDueDate;
    };

    roots.forEach(processNode);

    roots.sort((a, b) => a.rank.localeCompare(b.rank));

    return roots;
  });

  return { state, setState, refreshTasks, initializeTaskStore, tasks, cleanupReactiveQueries };
});

const { state, setState, refreshTasks, initializeTaskStore, tasks, cleanupReactiveQueries } = taskStore;

export { initializeTaskStore, tasks, cleanupReactiveQueries };

export const rawTasks = state.tasks;

type NewTaskPayload = {
  content: string;
  dueDate?: string | number | null;
};

export const addTask = async (data: NewTaskPayload, parentId: string | null = null) => {
  const id = nanoid();
  const parsedDue = data.dueDate
    ? typeof data.dueDate === "number"
      ? data.dueDate
      : new Date(data.dueDate).getTime()
    : null;
  const dueAt = Number.isFinite(parsedDue) ? parsedDue : null;

  const rank = await computeInitialRank(parentId, dueAt);

  const db = await getDb();
  
  db.exec(
    "INSERT INTO tasks (id, parent_id, text, completed, created_at, due_at, rank, is_deleted) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    [id, parentId, data.content, 0, Date.now(), dueAt, rank, 0]
  );

  const newTask: Task = {
    id,
    parentId,
    text: data.content,
    completed: false,
    createdAt: Date.now(),
    dueAt,
    rank,
    isDeleted: false,
  };

  console.log("[client] addTask", { id, parentId, text: data.content });
  return newTask;
};

export const updateTask = async (id: string, fields: Partial<Task>) => {
  const db = await getDb();
  const rows = await db.execO("SELECT * FROM tasks WHERE id = ?", [id]);
  
  if (!rows || !Array.isArray(rows) || rows.length === 0) return;

  const current = rows[0];

  const updates: string[] = [];
  const values: any[] = [];

  if (fields.parentId !== undefined) {
    updates.push("parent_id = ?");
    values.push(fields.parentId);
  }
  if (fields.text !== undefined) {
    updates.push("text = ?");
    values.push(fields.text);
  }
  if (fields.completed !== undefined) {
    updates.push("completed = ?");
    values.push(fields.completed ? 1 : 0);
  }
  if (fields.dueAt !== undefined) {
    updates.push("due_at = ?");
    values.push(fields.dueAt);
  }
  if (fields.rank !== undefined) {
    updates.push("rank = ?");
    values.push(fields.rank);
  }
  if (fields.isDeleted !== undefined) {
    updates.push("is_deleted = ?");
    values.push(fields.isDeleted ? 1 : 0);
  }

  if (updates.length) {
    values.push(id);
    db.exec(`UPDATE tasks SET ${updates.join(", ")} WHERE id = ?`, values);
  }
};

export const moveTask = async (
  taskId: string, 
  newParentId: string | null, 
  prevSiblingRank?: string, 
  nextSiblingRank?: string
) => {
  const db = await getDb();
  const rows = await db.execO("SELECT * FROM tasks WHERE id = ? AND is_deleted = 0", [taskId]);
  
  if (!rows || !Array.isArray(rows) || rows.length === 0) return;

  const task = rows[0];

  let newRank;
  if (!prevSiblingRank && !nextSiblingRank) {
    newRank = LexoRank.middle().toString();
  } else if (!prevSiblingRank && nextSiblingRank) {
    newRank = LexoRank.parse(nextSiblingRank).genPrev().toString();
  } else if (prevSiblingRank && !nextSiblingRank) {
    newRank = LexoRank.parse(prevSiblingRank).genNext().toString();
  } else {
    newRank = LexoRank.parse(prevSiblingRank!).between(LexoRank.parse(nextSiblingRank!)).toString();
  }

  db.exec(
    "UPDATE tasks SET parent_id = ?, rank = ? WHERE id = ?",
    [newParentId, newRank, taskId]
  );
};

export const deleteTask = async (id: string) => {
  const db = await getDb();
  
  const toRemove: string[] = [id];
  let found = true;

  while (found) {
    found = false;
    const rows = await db.execO("SELECT * FROM tasks WHERE is_deleted = 0");
    if (Array.isArray(rows)) {
      rows.forEach((row: any) => {
        if (toRemove.includes(row.parent_id) && !toRemove.includes(row.id)) {
          toRemove.push(row.id);
          found = true;
        }
      });
    }
  }

  toRemove.forEach(taskId => {
    db.exec("UPDATE tasks SET is_deleted = 1 WHERE id = ?", [taskId]);
  });
};
