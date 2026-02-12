import { describe, it, expect } from "vitest";
import { isStalled, STALE_THRESHOLD_MS, type Task } from "./taskStore";

const makeTask = (overrides: Partial<Task> = {}): Task => ({
  id: "test-id",
  parentId: null,
  text: "Test task",
  completed: false,
  createdAt: Date.now(),
  updatedAt: Date.now(),
  dueAt: null,
  rank: "0|aaa:",
  isStalled: false,
  ...overrides,
});

describe("Task updatedAt", () => {
  it("new task has updatedAt == createdAt", () => {
    const now = Date.now();
    const task = makeTask({ createdAt: now, updatedAt: now });
    expect(task.updatedAt).toBe(task.createdAt);
  });

  it("editing task text updates updatedAt", () => {
    const created = Date.now() - 1000;
    const updated = Date.now();
    const task = makeTask({ createdAt: created, updatedAt: updated });
    expect(task.updatedAt).toBeGreaterThan(task.createdAt);
  });

  it("toggling completion updates updatedAt", () => {
    const created = Date.now() - 1000;
    const updated = Date.now();
    const task = makeTask({ createdAt: created, updatedAt: updated, completed: true });
    expect(task.updatedAt).toBeGreaterThan(task.createdAt);
  });

  it("moving task updates updatedAt", () => {
    const created = Date.now() - 1000;
    const updated = Date.now();
    const task = makeTask({ createdAt: created, updatedAt: updated, parentId: "new-parent" });
    expect(task.updatedAt).toBeGreaterThan(task.createdAt);
  });
});

describe("isStalled", () => {
  it("returns true for old untouched tasks", () => {
    const oldTime = Date.now() - STALE_THRESHOLD_MS - 1;
    const task = makeTask({ createdAt: oldTime, updatedAt: oldTime });
    expect(isStalled(task)).toBe(true);
  });

  it("returns false for recently created tasks", () => {
    const now = Date.now();
    const task = makeTask({ createdAt: now, updatedAt: now });
    expect(isStalled(task)).toBe(false);
  });

  it("returns false for old but edited tasks", () => {
    const oldTime = Date.now() - STALE_THRESHOLD_MS - 1;
    const task = makeTask({ createdAt: oldTime, updatedAt: Date.now() });
    expect(isStalled(task)).toBe(false);
  });
});
