import { cleanup, render, screen } from "@solidjs/testing-library";
import { afterEach, describe, expect, it } from "vitest";
import { setTaskExpanded, type TreeNode } from "~/stores/taskStore";
import { TasksList } from "./TasksList";

const makeNode = (overrides: Partial<TreeNode> = {}): TreeNode => ({
  id: "task-1",
  parentId: null,
  workspaceId: "default",
  text: "Parent task",
  completed: false,
  createdAt: 1,
  updatedAt: 1,
  dueAt: null,
  rank: "0|aaa:",
  isStalled: false,
  effectiveDueDate: null,
  children: [],
  ...overrides,
});

describe("TasksList", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders the provided empty state when no tasks are visible", () => {
    render(() => <TasksList tasks={[]} emptyState={<div>No stalled tasks in this workspace.</div>} />);

    expect(screen.getByText("No stalled tasks in this workspace.")).toBeInTheDocument();
  });

  it("shows subtasks immediately when a task is marked expanded", () => {
    const parentId = "parent-expanded";
    setTaskExpanded(parentId, true);

    render(() => (
      <TasksList
        tasks={[
          makeNode({
            id: parentId,
            text: "Plan the launch",
            children: [
              makeNode({
                id: "child-1",
                parentId,
                text: "Write the checklist",
              }),
            ],
          }),
        ]}
      />
    ));

    expect(screen.getByText("Write the checklist")).toBeInTheDocument();

    setTaskExpanded(parentId, false);
  });
});
