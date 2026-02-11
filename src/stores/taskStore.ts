import { createEffect, createMemo, createRoot } from "solid-js";
import { createStore } from "solid-js/store";
import { isServer } from "solid-js/web";
import { LexoRank } from "lexorank";
import { initDb, exec, query, dbVersion } from "~/lib/db";
import { fetchMainViewTasks } from "~/lib/query";

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
  updatedAt: number;
  dueAt: number | null;
  rank: string;
  isStalled: boolean;
};

export const STALE_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000;

export const isStalled = (task: Task, now: number = Date.now()): boolean =>
  task.updatedAt === task.createdAt && (now - task.createdAt) > STALE_THRESHOLD_MS;

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
  updatedAt: row.updated_at,
  dueAt: row.due_at,
  rank: row.rank,
  isStalled: Boolean(row.is_stalled),
});

const compareDueThenRank = (a: Task, b: Task) => {
  const aDue = a.dueAt ?? Number.POSITIVE_INFINITY;
  const bDue = b.dueAt ?? Number.POSITIVE_INFINITY;
  if (aDue !== bDue) return aDue - bDue;
  return a.rank.localeCompare(b.rank);
};

const computeInitialRank = async (parentId: string | null, dueAt: number | null) => {
  let rows: any[];
  if (parentId) {
    rows = await query("SELECT * FROM tasks WHERE parent_id = ?", [parentId]);
  } else {
    rows = await query("SELECT * FROM tasks WHERE parent_id IS NULL");
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

  const refreshTasks = async () => {
    const rows = await fetchMainViewTasks();
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

  // Auto-refresh when db changes via worker broadcast
  createEffect(() => {
    const version = dbVersion();
    if (version > 0) {
      refreshTasks();
    }
  });

  const initializeTaskStore = async () => {
    if (isServer) return;

    try {
      await initDb();
      await refreshTasks();
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

      return node.effectiveDueDate;
    };

    roots.forEach(processNode);

    return roots;
  });

  return { state, setState, initializeTaskStore, tasks };
});

const { state, setState, initializeTaskStore, tasks } = taskStore;

export { initializeTaskStore, tasks };

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

  const now = Date.now();
  await exec(
    "INSERT INTO tasks (id, parent_id, text, completed, created_at, updated_at, due_at, rank) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    [id, parentId, data.content, 0, now, now, dueAt, rank]
  );

  const newTask: Task = {
    id,
    parentId,
    text: data.content,
    completed: false,
    createdAt: now,
    updatedAt: now,
    dueAt,
    rank,
    isStalled: false,
  };

  console.log("[client] addTask", { id, parentId, text: data.content });
  return newTask;
};

export const updateTask = async (id: string, fields: Partial<Task>) => {
  const rows = await query("SELECT * FROM tasks WHERE id = ?", [id]);
  
  if (!rows || !Array.isArray(rows) || rows.length === 0) return;

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

  if (updates.length) {
    updates.push("updated_at = ?");
    values.push(Date.now());
    values.push(id);
    await exec(`UPDATE tasks SET ${updates.join(", ")} WHERE id = ?`, values);
  }
};

export const moveTask = async (
  taskId: string, 
  newParentId: string | null, 
  prevSiblingRank?: string, 
  nextSiblingRank?: string
) => {
  const rows = await query("SELECT * FROM tasks WHERE id = ?", [taskId]);
  
  if (!rows || !Array.isArray(rows) || rows.length === 0) return;

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

  await exec(
    "UPDATE tasks SET parent_id = ?, rank = ?, updated_at = ? WHERE id = ?",
    [newParentId, newRank, Date.now(), taskId]
  );
};

export const deleteTask = async (id: string) => {
  const toRemove: string[] = [id];
  let found = true;

  while (found) {
    found = false;
    const rows = await query("SELECT * FROM tasks");
    if (Array.isArray(rows)) {
      rows.forEach((row: any) => {
        if (toRemove.includes(row.parent_id) && !toRemove.includes(row.id)) {
          toRemove.push(row.id);
          found = true;
        }
      });
    }
  }

  for (const taskId of toRemove) {
    await exec("DELETE FROM tasks WHERE id = ?", [taskId]);
  }
};
