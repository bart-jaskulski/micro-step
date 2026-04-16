import { createMemo, createSignal, For, Show } from "solid-js";
import { A } from "@solidjs/router";
import { Title } from "@solidjs/meta";
import Filter from "lucide-solid/icons/filter";
import Settings2 from "lucide-solid/icons/settings-2";
import TaskPrompt from "~/components/TaskPrompt";
import TasksList from "~/components/TasksList";
import {
  createTaskPriorityComparator,
  isTaskStalledForMainView,
} from "~/lib/taskPriority";
import {
  DEFAULT_LIST_FILTER,
  listFilter,
  LIST_FILTER_OPTIONS,
  setListFilter,
  type ListFilter,
} from "~/stores/preferencesStore";
import {
  selectedWorkspaceId,
  selectWorkspace,
  tasks,
  workspaces,
  type TreeNode,
} from "~/stores/taskStore";

const FILTER_LABELS: Record<ListFilter, string> = {
  all: "All",
  active: "Active",
  completed: "Completed",
  stalled: "Stalled",
};

const matchesFilter = (task: TreeNode, filterMode: ListFilter) => {
  if (filterMode === "all") {
    return true;
  }

  if (filterMode === "active") {
    return !task.completed;
  }

  if (filterMode === "completed") {
    return task.completed;
  }

  return isTaskStalledForMainView(task);
};

const projectVisibleTasks = (nodes: TreeNode[], filterMode: ListFilter): TreeNode[] =>
  nodes.flatMap((node) => {
    const children = projectVisibleTasks(node.children, filterMode);

    // Keep matching descendants attached to their parent so the tree stays legible.
    if (!matchesFilter(node, filterMode) && children.length === 0) {
      return [];
    }

    return [{ ...node, children }];
  });

const sortTasksByPriority = (nodes: TreeNode[], now: number): TreeNode[] => {
  const compare = createTaskPriorityComparator<TreeNode>(now);

  return nodes
    .map((node) => ({
      ...node,
      children: sortTasksByPriority(node.children, now),
    }))
    .sort(compare);
};

export default function Home() {
  const [activePanel, setActivePanel] = createSignal<"filter" | null>(null);
  const [fabVisible, setFabVisible] = createSignal(true);

  let lastScrollY = 0;

  const visibleTasks = createMemo(() => {
    const now = Date.now();
    const projected = projectVisibleTasks(tasks(), listFilter());
    return sortTasksByPriority(projected, now);
  });

  const emptyStateMessage = createMemo(() => {
    if (listFilter() === "active") {
      return "No active tasks in this workspace.";
    }

    if (listFilter() === "completed") {
      return "No completed tasks in this workspace.";
    }

    if (listFilter() === "stalled") {
      return "No stalled tasks in this workspace.";
    }

    return "No tasks in this workspace yet.";
  });

  const handleScroll = (event: Event) => {
    const target = event.target as HTMLElement;
    const currentScrollY = target.scrollTop;

    if (currentScrollY > lastScrollY && currentScrollY > 50) {
      setFabVisible(false);
    } else {
      setFabVisible(true);
    }

    lastScrollY = currentScrollY;
  };

  const toggleFilterPanel = () => setActivePanel(activePanel() === "filter" ? null : "filter");

  const applyFilter = (value: ListFilter) => {
    setListFilter(value);
    setActivePanel(null);
  };

  return (
    <div class="h-screen flex flex-col overflow-hidden bg-[#F9F9F8] text-stone-700 selection:bg-stone-200">
      <Title>FocusFlow</Title>

      <header class="flex-none px-6 py-5 flex justify-between items-center bg-[#F9F9F8]/90 backdrop-blur z-40 sticky top-0">
        <button
          type="button"
          onClick={toggleFilterPanel}
          class={`p-2 -ml-2 rounded-full transition relative ${
            activePanel() === "filter" || listFilter() !== DEFAULT_LIST_FILTER
              ? "bg-stone-800 text-white"
              : "text-stone-500 hover:bg-stone-200"
          }`}
          aria-label="Open filters"
          aria-pressed={activePanel() === "filter"}
        >
          <Filter class="w-5 h-5" />
        </button>

        <div class="flex gap-2">
          <A
            href="/settings"
            class="p-2 -mr-2 rounded-full hover:bg-stone-200 transition text-stone-500"
            aria-label="Open settings"
          >
            <Settings2 class="w-5 h-5" />
          </A>
        </div>
      </header>

      <div class="flex-none px-4 pb-2">
        <div class="w-full max-w-xl mx-auto flex gap-2 overflow-x-auto no-scrollbar">
          <For each={workspaces()}>
            {(workspace) => (
              <button
                type="button"
                onClick={() => void selectWorkspace(workspace.id)}
                class={`shrink-0 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
                  selectedWorkspaceId() === workspace.id
                    ? "border-stone-800 bg-stone-800 text-white"
                    : "border-stone-200 bg-white text-stone-500 hover:border-stone-300 hover:text-stone-700"
                }`}
              >
                {workspace.name}
              </button>
            )}
          </For>
        </div>
      </div>

      <div class="flex-none px-4 pb-3">
        <div class="w-full max-w-xl mx-auto rounded-2xl border border-stone-200 bg-white/80 px-4 py-3 text-sm text-stone-500">
          <div class="flex items-center gap-2">
            <span>{FILTER_LABELS[listFilter()]}</span>
            <span class="text-stone-300">/</span>
            <span>Urgency ranking</span>
          </div>

          <Show when={activePanel() === "filter"}>
            <div class="mt-3 flex flex-wrap gap-2">
              <For each={LIST_FILTER_OPTIONS}>
                {(option) => (
                  <button
                    type="button"
                    onClick={() => applyFilter(option)}
                    class={`rounded-full border px-3 py-1.5 font-medium transition-colors ${
                      listFilter() === option
                        ? "border-stone-800 bg-stone-800 text-white"
                        : "border-stone-200 bg-stone-50 text-stone-500 hover:border-stone-300 hover:text-stone-700"
                    }`}
                  >
                    {FILTER_LABELS[option]}
                  </button>
                )}
              </For>
            </div>
          </Show>
        </div>
      </div>

      <main
        class="flex-1 overflow-y-auto px-4 pb-40 scroll-smooth w-full max-w-xl mx-auto"
        onScroll={handleScroll}
      >
        <TasksList
          tasks={visibleTasks()}
          emptyState={<div class="p-4 text-center text-stone-400">{emptyStateMessage()}</div>}
        />
      </main>

      <TaskPrompt visible={fabVisible()} />
    </div>
  );
}
