import { fireEvent, render, screen } from "@solidjs/testing-library";
import { afterEach, describe, expect, it, vi } from "vitest";
import TaskItem from "./TaskItem";

const { updateTask } = vi.hoisted(() => ({
  updateTask: vi.fn(),
}));

vi.mock("~/stores/taskStore", () => ({
  deleteTask: vi.fn(),
  updateTask,
}));

vi.mock("./DragProvider", () => ({
  useDrag: () => ({
    startDrag: vi.fn(),
  }),
}));

describe("TaskItem due date editing", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("opens an inline date input when the date badge is clicked", async () => {
    render(() => (
      <TaskItem
        id="task-1"
        parentId={null}
        workspaceId="default"
        text="Test task"
        completed={false}
        createdAt={1}
        updatedAt={1}
        dueAt={null}
        rank="0|aaa:"
        isStalled={false}
      />
    ));

    await fireEvent.click(screen.getByRole("button", { name: "Set due date" }));

    expect(screen.getByLabelText("Choose due date")).toBeInTheDocument();
  });

  it("persists the chosen due date", async () => {
    render(() => (
      <TaskItem
        id="task-1"
        parentId={null}
        workspaceId="default"
        text="Test task"
        completed={false}
        createdAt={1}
        updatedAt={1}
        dueAt={null}
        rank="0|aaa:"
        isStalled={false}
      />
    ));

    await fireEvent.click(screen.getByRole("button", { name: "Set due date" }));
    await fireEvent.change(screen.getByLabelText("Choose due date"), {
      target: { value: "2026-04-12" },
    });

    expect(updateTask).toHaveBeenCalledWith("task-1", { dueAt: Date.UTC(2026, 3, 12) });
  });
});
