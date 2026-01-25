import { Title } from "@solidjs/meta";
import { createSignal, For, Show, createEffect, createMemo } from "solid-js";
import { rawTasks } from "~/stores/taskStore";
import "./Logbook.css";

type SortOption = "created-desc" | "created-asc";
type FilterStatus = "all" | "completed" | "active";

type Task = {
  id: string;
  parentId: string | null;
  text: string;
  completed: boolean;
  createdAt: number;
  dueAt: number | null;
  rank: string;
  isDeleted: boolean;
};

const dbRowToTask = (row: Record<string, unknown>): Task => ({
  id: row.id as string,
  parentId: row.parent_id as string | null,
  text: row.text as string,
  completed: Boolean(row.completed),
  createdAt: row.created_at as number,
  dueAt: row.due_at as number | null,
  rank: row.rank as string,
  isDeleted: Boolean(row.is_deleted),
});

export default function Logbook() {
  const [sort, setSort] = createSignal<SortOption>("created-desc");
  const [filterStatus, setFilterStatus] = createSignal<FilterStatus>("completed");
  const [showArchived, setShowArchived] = createSignal(false);

  const allTasks = createMemo(() => Object.values(rawTasks));

  const filteredTasks = () => {
    let filtered = [...allTasks()];

    if (filterStatus() === "completed") {
      filtered = filtered.filter(t => t.completed);
    } else if (filterStatus() === "active") {
      filtered = filtered.filter(t => !t.completed);
    }

    if (showArchived()) {
      filtered = filtered.filter(t => t.isDeleted);
    } else {
      filtered = filtered.filter(t => !t.isDeleted);
    }

    if (sort() === "created-desc") {
      filtered.sort((a, b) => b.createdAt - a.createdAt);
    } else if (sort() === "created-asc") {
      filtered.sort((a, b) => a.createdAt - b.createdAt);
    }

    return filtered;
  };

  return (
    <main>
      <Title>Archive</Title>
      <header class="logbook-header">
        <h1>Archive</h1>
        <div class="logbook-controls">
          <div class="filter-group">
            <label>Status:</label>
            <select
              value={filterStatus()}
              onChange={(e) => setFilterStatus(e.currentTarget.value as FilterStatus)}
            >
              <option value="completed">Completed</option>
              <option value="active">Active</option>
              <option value="all">All</option>
            </select>
          </div>

          <div class="filter-group">
            <label>Sort:</label>
            <select
              value={sort()}
              onChange={(e) => setSort(e.currentTarget.value as SortOption)}
            >
              <option value="created-desc">Newest First</option>
              <option value="created-asc">Oldest First</option>
            </select>
          </div>

          <div class="filter-group">
            <label>
              <input
                type="checkbox"
                checked={showArchived()}
                onChange={(e) => setShowArchived(e.currentTarget.checked)}
              />
              Show Archived
            </label>
          </div>
        </div>
      </header>

      <div class="logbook-list">
        <For each={filteredTasks()} fallback={<div class="empty-state">No tasks found</div>}>
          {(task) => (
            <div class="logbook-item" classList={{ completed: task.completed }}>
              <div class="task-text">{task.text}</div>
              <div class="task-meta">
                <span class="task-date">
                  {new Date(task.createdAt).toLocaleDateString()}
                </span>
                <Show when={task.completed}>
                  <span class="task-status">Completed</span>
                </Show>
                <Show when={task.isDeleted}>
                  <span class="task-status archived">Archived</span>
                </Show>
              </div>
            </div>
          )}
        </For>
      </div>
    </main>
  );
}
