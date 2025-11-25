import * as Y from "yjs";
import { IndexeddbPersistence } from "y-indexeddb";
import { createMemo, onMount } from "solid-js";
import { createStore, reconcile } from "solid-js/store";
import { isServer } from "solid-js/web";
import { LexoRank } from "lexorank";

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
};

export type TreeNode = Task & {
  children: TreeNode[];
  effectiveDueDate: number | null; // Bubbled up date
};

const compareDueThenRank = (a: Task, b: Task) => {
  const aDue = a.dueAt ?? Number.POSITIVE_INFINITY;
  const bDue = b.dueAt ?? Number.POSITIVE_INFINITY;
  if (aDue !== bDue) return aDue - bDue;
  return a.rank.localeCompare(b.rank);
};

const computeInitialRank = (parentId: string | null, dueAt: number | null) => {
  const siblings = Object.values(state.tasks).filter(t => t.parentId === parentId);

  if (!siblings.length) {
    return LexoRank.middle().toString();
  }

  // Insert by due date (nulls last), fall back to rank ordering
  const sorted = siblings.slice().sort(compareDueThenRank);
  const targetIndex = sorted.findIndex(sibling => {
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

const doc = new Y.Doc();
const yTasks = doc.getMap<Task>("tasks");
let provider: IndexeddbPersistence;

const [state, setState] = createStore({
  tasks: {} as Record<string, Task>,
  isSynced: false,
});

// --- 3. The Sync Logic ---
// We wrap this in a function to ensure it only runs on the client
const init = () => {
  if (isServer) return;
  if (provider) return; // Already initialized

  provider = new IndexeddbPersistence("my-app-tasks", doc);

  // Update Solid Store whenever Y.js changes
  yTasks.observe(() => {
    setState("tasks", reconcile(yTasks.toJSON()));
  });

  // Mark as synced when IDB loads
  provider.on("synced", () => {
    setState("isSynced", true);
  });
};

// Auto-initialize immediately when this file is imported on the client
onMount(init);

export const rawTasks = state.tasks;

export const tasks = createMemo(() => {
  const tasks = Object.values(state.tasks);
  const nodeMap = new Map<string, TreeNode>();

  // Initialize nodes
  tasks.forEach(t => {
    nodeMap.set(t.id, { ...t, children: [], effectiveDueDate: t.dueAt });
  });

  const roots: TreeNode[] = [];

  // Build Hierarchy
  tasks.forEach(t => {
    const node = nodeMap.get(t.id)!;
    if (t.parentId && nodeMap.has(t.parentId)) {
      nodeMap.get(t.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  });

  // Recursive Sort & Bubble Function
  const processNode = (node: TreeNode): number | null => {
    // 1. Process children first (Depth First)
    let minChildDate: number | null = null;

    node.children.forEach(child => {
      const childDate = processNode(child);

      // Bubble logic: Find earliest date among children
      if (childDate !== null) {
        if (minChildDate === null || childDate < minChildDate) {
          minChildDate = childDate;
        }
      }
    });

    // 2. Set effective due date (Self vs Children)
    if (node.dueAt !== null) {
      node.effectiveDueDate = minChildDate !== null 
        ? Math.min(node.dueAt, minChildDate) 
        : node.dueAt;
    } else {
      node.effectiveDueDate = minChildDate;
    }

    // 3. Sort Children
    // Here is where you decide: Rank vs DueDate
    node.children.sort((a, b) => {
      // Example: Always sort by Rank (Manual Drag & Drop)
      // If you want DueDate sorting, change this logic.
      return a.rank.localeCompare(b.rank);
    });

    return node.effectiveDueDate;
  };

  // Process roots
  roots.forEach(processNode);

  // Sort roots
  roots.sort((a, b) => a.rank.localeCompare(b.rank));

  return roots;
});

type NewTaskPayload = {
  content: string;
  dueDate?: string | number | null;
};

export const addTask = (data: NewTaskPayload, parentId: string | null = null) => {
  const id = nanoid();
  const parsedDue = data.dueDate
    ? typeof data.dueDate === "number"
      ? data.dueDate
      : new Date(data.dueDate).getTime()
    : null;
  const dueAt = Number.isFinite(parsedDue) ? parsedDue : null;

  const rank = computeInitialRank(parentId, dueAt);

  const newTask: Task = {
    id,
    parentId,
    text: data.content,
    completed: false,
    createdAt: Date.now(),
    dueAt,
    rank,
  };
  doc.transact(() => {

    yTasks.set(id, newTask);
  });

  return newTask;
};

export const updateTask = (id: string, fields: Partial<Task>) => {
  doc.transact(() => {
    const current = yTasks.get(id);
    if (current) {
      yTasks.set(id, { ...current, ...fields });
    }
  });
};

export const moveTask = (
  taskId: string, 
  newParentId: string | null, 
  prevSiblingRank?: string, 
  nextSiblingRank?: string
) => {
  doc.transact(() => {
    const task = yTasks.get(taskId);
    if (!task) return;

    // Calculate new rank between siblings
    let newRank;
    if (!prevSiblingRank && !nextSiblingRank) {
      newRank = LexoRank.middle();
    } else if (!prevSiblingRank && nextSiblingRank) {
      newRank = LexoRank.parse(nextSiblingRank).genPrev();
    } else if (prevSiblingRank && !nextSiblingRank) {
      newRank = LexoRank.parse(prevSiblingRank).genNext();
    } else {
      newRank = LexoRank.parse(prevSiblingRank!).between(LexoRank.parse(nextSiblingRank!));
    }

    yTasks.set(taskId, { 
      ...task, 
      parentId: newParentId, 
      rank: newRank.toString() 
    });
  });
};

export const deleteTask = (id: string) => {
  doc.transact(() => {
    if (!yTasks.has(id)) return;

    const snapshot = yTasks.toJSON();
    const toRemove: string[] = [];
    const stack = [id];

    while (stack.length) {
      const currentId = stack.pop()!;
      toRemove.push(currentId);

      Object.entries(snapshot).forEach(([taskId, task]) => {
        if (task.parentId === currentId) {
          stack.push(taskId);
        }
      });
    }

    toRemove.forEach(taskId => yTasks.delete(taskId));
  });
};
