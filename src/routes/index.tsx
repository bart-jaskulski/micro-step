import { createMemo, createSignal, For, Show } from "solid-js";
import { A } from "@solidjs/router";
import { Title } from "@solidjs/meta";
import Filter from "lucide-solid/icons/filter";
import ArrowDownWideNarrow from "lucide-solid/icons/arrow-down-wide-narrow";
import Settings2 from "lucide-solid/icons/settings-2";
import TaskPrompt from "~/components/TaskPrompt";
import TasksList from "~/components/TasksList";
import {
  DEFAULT_LIST_FILTER,
  DEFAULT_LIST_SORT_MODE,
  listFilter,
  LIST_FILTER_OPTIONS,
  LIST_SORT_MODE_OPTIONS,
  listSortMode,
  setListFilter,
  setListSortMode,
  type ListFilter,
  type ListSortMode,
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

const SORT_LABELS: Record<ListSortMode, string> = {
  manual: "Manual",
  "due-date": "Due date",
};

const dueDateComparator = (a: TreeNode, b: TreeNode) => {
  const aDue = a.effectiveDueDate ?? Number.POSITIVE_INFINITY;
  const bDue = b.effectiveDueDate ?? Number.POSITIVE_INFINITY;

  if (aDue !== bDue) {
    return aDue - bDue;
  }

  return a.rank.localeCompare(b.rank);
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

  return task.isStalled && !task.completed;
};

const resolveEffectiveDueDate = (task: TreeNode, children: TreeNode[]) => {
  const earliestChildDueDate = children.reduce<number | null>((earliest, child) => {
    if (child.effectiveDueDate === null) {
      return earliest;
    }

    if (earliest === null || child.effectiveDueDate < earliest) {
      return child.effectiveDueDate;
    }

    return earliest;
  }, null);

  if (task.dueAt === null) {
    return earliestChildDueDate;
  }

  if (earliestChildDueDate === null) {
    return task.dueAt;
  }

  return Math.min(task.dueAt, earliestChildDueDate);
};

const projectVisibleTasks = (nodes: TreeNode[], filterMode: ListFilter): TreeNode[] =>
  nodes.flatMap((node) => {
    const children = projectVisibleTasks(node.children, filterMode);
    const effectiveDueDate = resolveEffectiveDueDate(node, children);

    // Keep matching descendants attached to their parent so the tree stays legible.
    if (!matchesFilter(node, filterMode) && children.length === 0) {
      return [];
    }

    return [{ ...node, children, effectiveDueDate }];
  });

const sortTasksByDueDate = (nodes: TreeNode[]): TreeNode[] =>
  nodes
    .map((node) => ({
      ...node,
      children: sortTasksByDueDate(node.children),
    }))
    .sort(dueDateComparator);

export default function Home() {
  const [activePanel, setActivePanel] = createSignal<"filter" | "sort" | null>(null);
  const [fabVisible, setFabVisible] = createSignal(true);

  let lastScrollY = 0;

  const visibleTasks = createMemo(() => {
    const projected = projectVisibleTasks(tasks(), listFilter());

    if (listSortMode() === "manual") {
      return projected;
    }

    return sortTasksByDueDate(projected);
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

  const togglePanel = (panel: "filter" | "sort") => {
    setActivePanel(activePanel() === panel ? null : panel);
  };

  const applyFilter = (value: ListFilter) => {
    setListFilter(value);
    setActivePanel(null);
  };

  const applySort = (value: ListSortMode) => {
    setListSortMode(value);
    setActivePanel(null);
  };

  return (
    <div class="h-screen flex flex-col overflow-hidden bg-[#F9F9F8] text-stone-700 selection:bg-stone-200">
      <Title>FocusFlow</Title>

      <header class="flex-none px-6 py-5 flex justify-between items-center bg-[#F9F9F8]/90 backdrop-blur z-40 sticky top-0">
        <button
          type="button"
          onClick={() => togglePanel("filter")}
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
          <button
            type="button"
            onClick={() => togglePanel("sort")}
            class={`p-2 rounded-full transition ${
              activePanel() === "sort" || listSortMode() !== DEFAULT_LIST_SORT_MODE
                ? "bg-stone-800 text-white"
                : "text-stone-500 hover:bg-stone-200"
            }`}
            aria-label="Open sorting"
            aria-pressed={activePanel() === "sort"}
          >
            <ArrowDownWideNarrow class="w-5 h-5" />
          </button>
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
            <span>{SORT_LABELS[listSortMode()]}</span>
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

          <Show when={activePanel() === "sort"}>
            <div class="mt-3 space-y-3">
              <div class="flex flex-wrap gap-2">
                <For each={LIST_SORT_MODE_OPTIONS}>
                  {(option) => (
                    <button
                      type="button"
                      onClick={() => applySort(option)}
                      class={`rounded-full border px-3 py-1.5 font-medium transition-colors ${
                        listSortMode() === option
                          ? "border-stone-800 bg-stone-800 text-white"
                          : "border-stone-200 bg-stone-50 text-stone-500 hover:border-stone-300 hover:text-stone-700"
                      }`}
                    >
                      {SORT_LABELS[option]}
                    </button>
                  )}
                </For>
              </div>
              <p class="text-xs text-stone-400">
                Manual keeps drag ordering. Due date uses derived ordering with undated tasks last.
              </p>
            </div>
          </Show>
        </div>
      </div>

      <main
        class="flex-1 overflow-y-auto px-4 pb-40 scroll-smooth w-full max-w-xl mx-auto"
        onScroll={handleScroll}
      >
        <Show when={listSortMode() === "due-date"}>
          <div class="mb-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Due date sort is derived. Switch back to manual sort to reorder tasks.
          </div>
        </Show>

        <TasksList
          tasks={visibleTasks()}
          fallback={<div class="p-4 text-center text-stone-400">{emptyStateMessage()}</div>}
        />
      </main>

      <TaskPrompt visible={fabVisible()} />
    </div>
  );
}
