import { createEffect, createMemo, createSignal, on, Show } from "solid-js";
import { useSubmission } from "@solidjs/router";
import ArrowUp from "lucide-solid/icons/arrow-up";
import Plus from "lucide-solid/icons/plus";
import Calendar from "lucide-solid/icons/calendar";
import X from "lucide-solid/icons/x";
import { addTask, setTaskExpanded } from "~/stores/taskStore";
import { breakdownTask, type BreakdownTaskResult } from "~/actions/taskActions";
import { isOnline } from "~/stores/networkStore";
import { breakdownGranularity } from "~/stores/preferencesStore";

type TaskPromptProps = {
  visible: boolean;
};

function MagicScissorsIcon(props: { class?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      class={props.class}
    >
      <path d="M15 2a2 2 0 0 0 2 2 2 2 0 0 0-2 2 2 2 0 0 0-2-2 2 2 0 0 0 2-2Z" />
      <path d="M20 10.5a1.5 1.5 0 0 0 1.5 1.5 1.5 1.5 0 0 0-1.5 1.5 1.5 1.5 0 0 0-1.5-1.5 1.5 1.5 0 0 0 1.5-1.5Z" />
      <circle cx="6" cy="6" r="3" />
      <circle cx="6" cy="18" r="3" />
      <path d="M8.12 8.12 12 12" />
      <path d="M20 4 8.12 15.88" />
      <path d="M14.8 14.8 20 20" />
    </svg>
  );
}

export default function TaskPrompt(props: TaskPromptProps) {
  const [isOpen, setIsOpen] = createSignal(false);
  const [mode, setMode] = createSignal<"default" | "clarify">("default");
  const submission = useSubmission(breakdownTask);
  const [clarification, setClarification] = createSignal<string>("");
  const [isAiEnabled, setIsAiEnabled] = createSignal(false);
  const [isSavingLocally, setIsSavingLocally] = createSignal(false);
  const [dueDate, setDueDate] = createSignal<string>("");
  const [taskText, setTaskText] = createSignal<string>("");
  const submissionResult = createMemo(() => submission.result as BreakdownTaskResult | undefined);

  const runWithTransition = async <T,>(fn: () => T | Promise<T>): Promise<T> => {
    const startViewTransition = (document as Document & {
      startViewTransition?: (cb: () => void | Promise<void>) => { finished: Promise<void> };
    }).startViewTransition;

    if (startViewTransition) {
      let result!: T;
      const transition = startViewTransition.call(document, async () => {
        result = await fn();
      });
      await transition.finished;
      return result;
    }

    return await fn();
  };

  const resetComposer = () => {
    setMode("default");
    setClarification("");
    setIsAiEnabled(false);
    setDueDate("");
    setTaskText("");

    if (textareaRef) {
      textareaRef.value = "";
      textareaRef.style.height = "auto";
    }

    if (clarifyTextareaRef) {
      clarifyTextareaRef.value = "";
      clarifyTextareaRef.style.height = "auto";
    }
  };

  createEffect(
    on(submissionResult, async (result) => {
      if (result) {
        switch (result.action) {
        case "createTasks":
          const { tasks } = result;
          const rootDueDate = dueDate() || undefined;

          const newTask = await runWithTransition(() =>
            addTask({
              content: result.title,
              dueDate: rootDueDate,
            })
          );

          if (!newTask) return;
          if (tasks.length > 0) {
            setTaskExpanded(newTask.id, true);
          }

          for (const t of tasks) {
            await runWithTransition(() => addTask(t, newTask.id));
          }
          setIsOpen(false);
          resetComposer();
          break;
        case "askClarification":
          setMode("clarify");
          setClarification(result.question);
          break;
        default:
          return;
        }
      }
    })
  );

  let textareaRef: HTMLTextAreaElement | undefined;
  let clarifyTextareaRef: HTMLTextAreaElement | undefined;

  const handleOpen = () => {
    setIsOpen(true);
    setMode("default");
    setTimeout(() => textareaRef?.focus(), 50);
  };

  const handleClose = () => {
    setIsOpen(false);
    resetComposer();
  };

  const handleKeyDown = (e: KeyboardEvent, formRef: HTMLFormElement | undefined) => {
    if (e.key === "Enter") {
      if (e.isComposing) return;
      if (e.shiftKey) return;
      e.preventDefault();

      const form = formRef || (e.currentTarget as HTMLTextAreaElement).form;
      const submitButton = form?.querySelector('button[type="submit"]') as HTMLButtonElement | null;
      if (submitButton?.disabled) return;

      form?.requestSubmit();
    }
  };

  const autoResize = (el: HTMLTextAreaElement) => {
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  };

  const handleSubmit = async (event: SubmitEvent) => {
    if (mode() !== "default" || isAiEnabled()) {
      return;
    }

    event.preventDefault();

    const task = taskText().trim();
    const selectedDueDate = dueDate() || undefined;

    if (!task || isSavingLocally()) {
      return;
    }

    setIsSavingLocally(true);

    try {
      await runWithTransition(() =>
        addTask({
          content: task,
          dueDate: selectedDueDate,
        })
      );
      setIsOpen(false);
      resetComposer();
    } finally {
      setIsSavingLocally(false);
    }
  };

  const submitDisabled = createMemo(() =>
    !taskText().trim() ||
    isSavingLocally() ||
    submission.pending ||
    (isAiEnabled() && !isOnline())
  );

  return (
    <>
      {/* FAB CONTAINER */}
      <div 
        class="fixed bottom-6 left-0 right-0 px-4 z-50 pointer-events-none transition-transform duration-300"
        style={{ transform: props.visible && !isOpen() ? 'translateY(0)' : 'translateY(150%)' }}
      >
        <div class="max-w-xl mx-auto pointer-events-auto">
          <button 
            onClick={handleOpen} 
            class="w-full bg-white/90 backdrop-blur-md border-2 border-dashed border-stone-300 text-stone-400 rounded-2xl p-4 flex items-center justify-center gap-2 hover:border-stone-500 hover:text-stone-600 hover:bg-white transition-all shadow-sm group"
          >
            <Plus class="w-5 h-5 transition-transform group-hover:scale-110" />
            <span class="font-medium">Add Task</span>
          </button>
        </div>
      </div>

      <Show when={isOpen()}>
        <div 
          class="fixed inset-0 bg-stone-900/20 backdrop-blur-[2px] z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={handleClose}
        >
          <div 
            class="bg-white w-full max-w-xl rounded-t-3xl sm:rounded-2xl shadow-2xl p-5"
            role="dialog"
            aria-modal="true"
            aria-labelledby="task-prompt-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div class="mb-4 flex items-center justify-between">
              <h2 id="task-prompt-title" class="text-lg font-semibold text-stone-800">
                {mode() === "clarify" ? "Clarify task" : "Add task"}
              </h2>

              <button
                type="button"
                onClick={handleClose}
                class="rounded-full p-2 text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-600"
                aria-label="Close task composer"
              >
                <X class="h-5 w-5" />
              </button>
            </div>

            <form
              action={breakdownTask}
              method="post"
              onSubmit={(event) => void handleSubmit(event)}
            >
              <input type="hidden" name="task" value={taskText()} />
              <input type="hidden" name="granularity" value={breakdownGranularity()} />

              <Show when={mode() === "default"}>
              <div class="bg-stone-50 rounded-xl p-3 mb-4 border border-stone-100 focus-within:border-stone-300 transition-colors">
                <textarea
                  ref={textareaRef}
                  placeholder="What needs to be done?"
                  aria-label="Task description"
                  class="w-full text-lg text-stone-800 placeholder:text-stone-400 bg-transparent outline-none min-h-[3rem] resize-none overflow-hidden"
                  rows={1}
                  value={taskText()}
                  onInput={(e) => {
                    setTaskText(e.currentTarget.value);
                    autoResize(e.currentTarget);
                  }}
                  onKeyDown={(e) => handleKeyDown(e, undefined)}
                />
              </div>

              <div class="flex items-center justify-between border-t border-stone-100 pt-4">
                <div class="flex items-center gap-2">
                  {/* Date Picker */}
                  <div class={`relative group p-2.5 rounded-xl hover:bg-stone-50 transition cursor-pointer ${dueDate() ? "bg-stone-100 text-stone-800" : "text-stone-400"}`}>
                    <Calendar class="w-6 h-6" />
                    <input 
                      type="date" 
                      aria-label="Choose due date"
                      class="absolute inset-0 opacity-0 cursor-pointer"
                      value={dueDate()}
                      onChange={(e) => setDueDate(e.currentTarget.value)} 
                    />
                  </div>

                  <div class="flex items-center gap-2 px-2 py-1.5">
                    <button 
                      type="button"
                      onClick={() => setIsAiEnabled(!isAiEnabled())}
                      aria-pressed={isAiEnabled()}
                      aria-label={isAiEnabled() ? "Disable AI breakdown" : "Enable AI breakdown"}
                      class={`rounded-lg p-2 transition ${isAiEnabled() ? "bg-stone-100 text-stone-800" : "text-stone-400 hover:bg-stone-50"}`}
                    >
                      <MagicScissorsIcon class="w-6 h-6" />
                    </button>

                  </div>
                </div>

                <button 
                  type="submit" 
                  class="bg-stone-800 hover:bg-black text-white p-3 rounded-xl shadow-lg hover:shadow-xl transition-all hover:scale-105 active:scale-95"
                  disabled={submitDisabled()}
                  aria-label={isAiEnabled() ? "Create task with AI breakdown" : "Create task"}
                >
                  <ArrowUp class={`w-6 h-6 ${isSavingLocally() || submission.pending ? "animate-bounce" : ""}`} />
                </button>
              </div>

              <Show when={isAiEnabled() && !isOnline()}>
                <p class="mt-3 text-sm text-amber-700">
                  AI breakdown needs an internet connection. You can still save this as a local task.
                </p>
              </Show>
            </Show>

            <Show when={mode() === "clarify"}>
              <div class="space-y-4">
                <div class="bg-blue-50 text-blue-800 p-4 rounded-xl text-sm">
                  {clarification()}
                </div>
                
                <div class="bg-stone-50 rounded-xl p-3 border border-stone-100 focus-within:border-stone-300">
                  <textarea
                    ref={clarifyTextareaRef}
                    name="clarification"
                    placeholder="Provide details..."
                    aria-label="Clarification details"
                    class="w-full text-base text-stone-800 bg-transparent outline-none resize-none"
                    rows={2}
                    onInput={(e) => autoResize(e.currentTarget)}
                    onKeyDown={(e) => handleKeyDown(e, undefined)}
                  />
                </div>
                
                <div class="flex justify-end gap-2">
                  <button 
                    type="button" 
                    onClick={() => { setMode("default"); setClarification(""); }}
                    class="px-4 py-2 text-stone-500 hover:bg-stone-100 rounded-lg text-sm font-medium"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit" 
                    class="bg-stone-800 hover:bg-black text-white px-4 py-2 rounded-lg shadow-sm transition-all"
                    disabled={submission.pending || !isOnline()}
                  >
                    Reply
                  </button>
                </div>
                <Show when={!isOnline()}>
                  <p class="text-sm text-amber-700">
                    Reconnect to continue the AI clarification flow.
                  </p>
                </Show>
              </div>
              </Show>

            </form>
          </div>
        </div>
      </Show>
    </>
  );
}
