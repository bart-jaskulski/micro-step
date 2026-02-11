import { createEffect, createSignal, For, Show } from "solid-js";
import { useSubmission } from "@solidjs/router";
import ArrowUp from "lucide-solid/icons/arrow-up";
import Scissors from "lucide-solid/icons/scissors";
import Check from "lucide-solid/icons/check";
import Plus from "lucide-solid/icons/plus";
import Calendar from "lucide-solid/icons/calendar";
import { addTask } from "~/stores/taskStore";
import { breakdownTask } from "~/actions/taskActions";

type Granularity = "low" | "medium" | "high";

type TaskPromptProps = {
  visible: boolean;
};

export default function TaskPrompt(props: TaskPromptProps) {
  const [isOpen, setIsOpen] = createSignal(false);
  const [mode, setMode] = createSignal<"default" | "clarify">("default");
  const submission = useSubmission(breakdownTask);
  const [clarification, setClarification] = createSignal<string>("");

  const runWithTransition = async (fn: () => void | Promise<void>) => {
    const startViewTransition = (document as Document & {
      startViewTransition?: (cb: () => void | Promise<void>) => { finished: Promise<void> };
    }).startViewTransition;

    if (startViewTransition) {
      const transition = startViewTransition.call(document, () => fn());
      await transition.finished;
      return;
    }

    await fn();
  };

  createEffect(async () => {
    if (submission.result) {
      console.log("[client] breakdownTask result", submission.result);
      switch (submission.result.action) {
        case "createTasks":
          const { tasks } = submission.result;

          let newTask;
          await runWithTransition(async () => {
            newTask = await addTask({ content: submission.result.title, dueDate: undefined });
          });

          console.log("[client] root task created", newTask);
          if (!newTask) return;
          for (const t of tasks) {
            await runWithTransition(() => addTask(t, newTask.id));
          }
          console.log("[client] subtasks added", tasks.length);
          setIsOpen(false); // Close modal on success
          break;
        case "askClarification":
          setMode("clarify");
          setClarification(submission.result.question);
          break;
        default:
          return;
      }
    }
  });

  const [granularityMenuOpen, setGranularityMenuOpen] = createSignal(false);
  const [granularity, setGranularity] = createSignal<Granularity>("medium");
  const [dueDate, setDueDate] = createSignal<string>("");
  let textareaRef: HTMLTextAreaElement | undefined;
  let clarifyTextareaRef: HTMLTextAreaElement | undefined;

  const handleOpen = () => {
    setIsOpen(true);
    setMode("default");
    // Small delay to allow render before focus
    setTimeout(() => textareaRef?.focus(), 50);
  };

  const handleClose = () => {
    setIsOpen(false);
    setGranularityMenuOpen(false);
  };

  const handleKeyDown = (e: KeyboardEvent, formRef: HTMLFormElement | undefined) => {
    if (e.key === "Enter") {
      if ((e as any).nativeEvent?.isComposing) return;
      if (e.shiftKey) return;
      e.preventDefault();

      const form = formRef || (e.currentTarget as HTMLTextAreaElement).form;
      const submitButton = form?.querySelector('button[type="submit"]') as HTMLButtonElement | null;
      if (submitButton?.disabled) return;

      form?.requestSubmit();
    }
  };

  // Auto-resize textarea
  const autoResize = (el: HTMLTextAreaElement) => {
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 'px';
  };

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

      {/* MODAL OVERLAY */}
      <div 
        class={`fixed inset-0 bg-stone-900/20 backdrop-blur-[2px] z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4 transition-opacity duration-300 ${isOpen() ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={handleClose}
      >
        <div 
          class={`bg-white w-full max-w-xl rounded-t-3xl sm:rounded-2xl shadow-2xl transition-transform duration-300 p-5 ${isOpen() ? 'translate-y-0' : 'translate-y-full'}`}
          onClick={(e) => e.stopPropagation()}
        >
          <form
            action={breakdownTask}
            method="post"
            onSubmit={() => console.log("[client] submitting", { granularity: granularity() })}
          >
            <input type="hidden" name="granularity" value={granularity()} />
            
            <Show when={mode() === "default"}>
              <div class="bg-stone-50 rounded-xl p-3 mb-4 border border-stone-100 focus-within:border-stone-300 transition-colors">
                <textarea
                  ref={textareaRef}
                  name="task"
                  placeholder="What needs to be done?"
                  class="w-full text-lg text-stone-800 placeholder:text-stone-400 bg-transparent outline-none min-h-[3rem] resize-none overflow-hidden"
                  rows={1}
                  onInput={(e) => autoResize(e.currentTarget)}
                  onKeyDown={(e) => handleKeyDown(e, undefined)}
                />
              </div>

              <div class="flex items-center justify-between border-t border-stone-100 pt-4">
                <div class="flex items-center gap-3">
                  {/* Date Picker */}
                  <div class={`relative group p-2.5 rounded-xl hover:bg-stone-50 transition cursor-pointer ${dueDate() ? 'bg-stone-100 text-stone-800' : 'text-stone-400'}`}>
                    <Calendar class="w-6 h-6" />
                    <input 
                      type="date" 
                      class="absolute inset-0 opacity-0 cursor-pointer"
                      onChange={(e) => setDueDate(e.currentTarget.value)} 
                    />
                  </div>

                  {/* Granularity */}
                  <div class="relative">
                    <button 
                      type="button"
                      onClick={() => setGranularityMenuOpen(!granularityMenuOpen())} 
                      class={`p-2.5 rounded-xl hover:bg-stone-50 transition ${granularityMenuOpen() ? 'bg-stone-100 text-stone-800' : 'text-stone-400'}`}
                    >
                      <Scissors class="w-6 h-6" />
                    </button>
                    
                    <Show when={granularityMenuOpen()}>
                      <div class="absolute bottom-14 left-0 bg-white shadow-xl border border-stone-100 rounded-xl p-1.5 flex gap-1 z-50 animate-in slide-in-from-bottom-2">
                        <For each={["low", "medium", "high"] as Granularity[]}>
                          {(level) => (
                            <button
                              type="button"
                              onClick={() => { setGranularity(level); setGranularityMenuOpen(false); }}
                              class={`px-3 py-1.5 text-xs font-semibold rounded-lg uppercase tracking-wide transition ${granularity() === level ? 'bg-stone-800 text-white' : 'hover:bg-stone-50 text-stone-500'}`}
                            >
                              {level}
                            </button>
                          )}
                        </For>
                      </div>
                    </Show>
                  </div>
                </div>

                <button 
                  type="submit" 
                  class="bg-stone-800 hover:bg-black text-white p-3 rounded-xl shadow-lg hover:shadow-xl transition-all hover:scale-105 active:scale-95"
                  disabled={submission.pending}
                >
                  <ArrowUp class={`w-6 h-6 ${submission.pending ? 'animate-bounce' : ''}`} />
                </button>
              </div>
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
                  >
                    Reply
                  </button>
                </div>
              </div>
            </Show>

          </form>
        </div>
      </div>
    </>
  );
}
