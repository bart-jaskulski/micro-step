import { describe, expect, it } from "vitest";
import {
  createTaskPriorityComparator,
  isTaskStalledForMainView,
  STALLED_TASK_THRESHOLD_MS,
  type PriorityTask,
} from "./taskPriority";

const now = Date.UTC(2026, 3, 16);
const day = 24 * 60 * 60 * 1000;

const makeTask = (id: string, overrides: Partial<PriorityTask> = {}): PriorityTask & { id: string } => ({
  id,
  completed: false,
  createdAt: now,
  dueAt: null,
  rank: `0|${id}:`,
  children: [],
  ...overrides,
});

describe("taskPriority", () => {
  it("matches the expected main-view order", () => {
    const compare = createTaskPriorityComparator(now);

    const tasks = [
      makeTask("task-1", { createdAt: now - 30 * day }),
      makeTask("task-2", { dueAt: now + day }),
      makeTask("task-3", { dueAt: now - 3 * day }),
      makeTask("task-4", { createdAt: now - day }),
    ];

    const ids = tasks.slice().sort(compare).map((task) => task.id);
    expect(ids).toEqual(["task-3", "task-2", "task-1", "task-4"]);
  });

  it("keeps all overdue explicit dates ahead of upcoming dates", () => {
    const compare = createTaskPriorityComparator(now);

    const tasks = [
      makeTask("old-overdue", { dueAt: now - 30 * day }),
      makeTask("upcoming", { dueAt: now + 2 * day }),
      makeTask("stalled", { createdAt: now - STALLED_TASK_THRESHOLD_MS - day }),
    ];

    const ids = tasks.slice().sort(compare).map((task) => task.id);
    expect(ids).toEqual(["old-overdue", "upcoming", "stalled"]);
  });

  it("surfaces a parent when it has a more urgent child", () => {
    const compare = createTaskPriorityComparator(now);

    const tasks = [
      makeTask("stalled-parent", {
        createdAt: now - 30 * day,
      }),
      makeTask("project", {
        createdAt: now - day,
        children: [makeTask("child", { dueAt: now - day })],
      }),
    ];

    const ids = tasks.slice().sort(compare).map((task) => task.id);
    expect(ids).toEqual(["project", "stalled-parent"]);
  });

  it("treats old incomplete tasks as stalled even if they were edited", () => {
    expect(
      isTaskStalledForMainView({
        completed: false,
        createdAt: now - STALLED_TASK_THRESHOLD_MS - day,
      }, now),
    ).toBe(true);
  });
});
