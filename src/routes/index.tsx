import { createSignal, For, Show } from "solid-js";
import { Title } from "@solidjs/meta";
import Filter from "lucide-solid/icons/filter";
import ArrowDownWideNarrow from "lucide-solid/icons/arrow-down-wide-narrow";
import Settings2 from "lucide-solid/icons/settings-2";
import ListTodo from "lucide-solid/icons/list-todo";
import Trash from "lucide-solid/icons/trash";
import TaskPrompt from "~/components/TaskPrompt";
import TasksList from "~/components/TasksList";
import {
  breakdownGranularity,
  BREAKDOWN_GRANULARITY_OPTIONS,
  setBreakdownGranularity,
} from "~/stores/preferencesStore";
import {
  createWorkspace,
  renameWorkspace,
  selectedWorkspaceId,
  selectWorkspace,
  tasks,
  workspaces,
} from "~/stores/taskStore";

export default function Home() {
  const [view, setView] = createSignal<"tasks" | "settings">("tasks");
  const [fabVisible, setFabVisible] = createSignal(true);

  const promptForWorkspaceName = (message: string, initialValue = "") => {
    if (typeof window === "undefined") {
      return null;
    }

    const nextName = window.prompt(message, initialValue)?.trim();
    return nextName ? nextName : null;
  };

  const handleCreateWorkspace = async () => {
    const name = promptForWorkspaceName("Name the new workspace");
    if (!name) {
      return;
    }

    await createWorkspace(name);
  };

  const handleRenameWorkspace = async (workspaceId: string, currentName: string) => {
    const nextName = promptForWorkspaceName("Rename workspace", currentName);
    if (!nextName || nextName === currentName) {
      return;
    }

    await renameWorkspace(workspaceId, nextName);
  };
  
  let lastScrollY = 0;
  const handleScroll = (e: Event) => {
    const target = e.target as HTMLElement;
    const currentScrollY = target.scrollTop;
    
    if (currentScrollY > lastScrollY && currentScrollY > 50) {
      setFabVisible(false);
    } else {
      setFabVisible(true);
    }
    lastScrollY = currentScrollY;
  };

  return (
    <div class="h-screen flex flex-col overflow-hidden bg-[#F9F9F8] text-stone-700 selection:bg-stone-200">
      <Title>FocusFlow</Title>
      
      {/* HEADER */}
      <header class="flex-none px-6 py-5 flex justify-between items-center bg-[#F9F9F8]/90 backdrop-blur z-40 sticky top-0">
        <button class="p-2 -ml-2 rounded-full hover:bg-stone-200 transition text-stone-500 relative group">
          <Filter class="w-5 h-5" />
        </button>
        
        <div class="flex gap-2">
          <button class="p-2 rounded-full hover:bg-stone-200 transition text-stone-500">
            <ArrowDownWideNarrow class="w-5 h-5" />
          </button>
          <button 
            onClick={() => setView(view() === "tasks" ? "settings" : "tasks")} 
            class="p-2 -mr-2 rounded-full hover:bg-stone-200 transition text-stone-500"
          >
            <Show when={view() === "tasks"} fallback={<ListTodo class="w-5 h-5" />}>
              <Settings2 class="w-5 h-5" />
            </Show>
          </button>
        </div>
      </header>

      <Show when={view() === "tasks"}>
        <div class="flex-none px-4 pb-3">
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
      </Show>

      {/* VIEW: TASKS */}
      <Show when={view() === "tasks"}>
        <main 
          class="flex-1 overflow-y-auto px-4 pb-40 scroll-smooth w-full max-w-xl mx-auto" 
          onScroll={handleScroll}
        >
          <TasksList tasks={tasks()} fallback={<div class="p-4 text-center text-stone-400">Loading tasks...</div>} />
        </main>
      </Show>

      {/* VIEW: SETTINGS */}
      <Show when={view() === "settings"}>
        <main class="flex-1 overflow-y-auto px-6 pt-4 w-full max-w-xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-300">
          <h1 class="text-3xl font-light text-stone-800 mb-8 tracking-tight">Settings</h1>
          <div class="bg-white rounded-2xl p-6 shadow-sm border border-stone-200/60 space-y-4 mb-6">
            <div class="flex justify-between items-center">
              <div>
                <span class="text-stone-700 font-medium block">Workspaces</span>
                <span class="text-stone-400 text-xs">Separate personal and work task lists</span>
              </div>
              <button
                type="button"
                onClick={() => void handleCreateWorkspace()}
                class="px-4 py-2 bg-stone-800 text-white rounded-lg text-sm font-medium hover:bg-black transition-colors"
              >
                New
              </button>
            </div>

            <div class="space-y-3">
              <For each={workspaces()}>
                {(workspace) => (
                  <div class="flex items-center justify-between rounded-xl border border-stone-200 px-4 py-3">
                    <div class="min-w-0">
                      <span class="text-stone-700 font-medium block truncate">{workspace.name}</span>
                      <Show when={selectedWorkspaceId() === workspace.id}>
                        <span class="text-stone-400 text-xs">Current workspace</span>
                      </Show>
                    </div>

                    <div class="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          void selectWorkspace(workspace.id);
                          setView("tasks");
                        }}
                        class="px-3 py-1.5 rounded-lg bg-stone-100 text-sm text-stone-600 hover:bg-stone-200 transition-colors"
                      >
                        Open
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleRenameWorkspace(workspace.id, workspace.name)}
                        class="px-3 py-1.5 rounded-lg bg-white text-sm text-stone-500 hover:bg-stone-100 transition-colors"
                      >
                        Rename
                      </button>
                    </div>
                  </div>
                )}
              </For>
            </div>
          </div>

          <div class="bg-white rounded-2xl p-6 shadow-sm border border-stone-200/60 space-y-6">
            <div class="space-y-3">
              <div>
                <span class="text-stone-700 font-medium block">Task Breakdown</span>
                <span class="text-stone-400 text-xs">Default detail level when AI breakdown is enabled</span>
              </div>

              <div class="grid grid-cols-3 gap-2">
                <For each={BREAKDOWN_GRANULARITY_OPTIONS}>
                  {(level) => (
                    <button
                      type="button"
                      onClick={() => setBreakdownGranularity(level)}
                      class={`rounded-xl border px-3 py-2 text-sm font-medium capitalize transition-colors ${
                        breakdownGranularity() === level
                          ? "border-stone-800 bg-stone-800 text-white"
                          : "border-stone-200 bg-stone-50 text-stone-500 hover:border-stone-300 hover:text-stone-700"
                      }`}
                    >
                      {level}
                    </button>
                  )}
                </For>
              </div>
            </div>

            <hr class="border-stone-100" />

            <div class="flex justify-between items-center">
              <div>
                <span class="text-stone-700 font-medium block">Sync Devices</span>
                <span class="text-stone-400 text-xs">Local-first peer-to-peer sync</span>
              </div>
              <a href="/pair" class="px-4 py-2 bg-stone-100 rounded-lg text-sm text-stone-600 hover:bg-stone-200 font-medium transition-colors inline-block">Pair</a>
            </div>
            <hr class="border-stone-100" />
            <div class="flex justify-between items-center">
              <span class="text-stone-700 font-medium">Dark Mode</span>
              <div class="w-12 h-6 bg-stone-200 rounded-full relative cursor-pointer hover:bg-stone-300 transition">
                <div class="w-4 h-4 bg-white rounded-full absolute left-1 top-1 shadow-sm" />
              </div>
            </div>
            <hr class="border-stone-100" />
            <div class="flex justify-between items-center">
              <span class="text-stone-700 font-medium text-red-400">Clear All Data</span>
              <button class="p-2 text-stone-400 hover:text-red-500 transition">
                <Trash class="w-4 h-4" />
              </button>
            </div>
          </div>
        </main>
      </Show>

      {/* FAB & PROMPT */}
      <Show when={view() === "tasks"}>
        <TaskPrompt visible={fabVisible()} />
      </Show>
    </div>
  );
}
