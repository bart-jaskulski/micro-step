import { createEffect, createSignal, For, Show } from "solid-js"
import { useSubmission } from "@solidjs/router";
import ArrowUp from "lucide-solid/icons/arrow-up"
import ScissorsLineDashed from "lucide-solid/icons/scissors-line-dashed"
import Checked from "lucide-solid/icons/check"
import { addTask } from "~/stores/taskStore"
import { breakdownTask } from "~/actions/taskActions"
import "./TaskPrompt.css"

type Granularity = "low" | "medium" | "high"

export default function TaskPrompt() {
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
  const [isComposing, setIsComposing] = createSignal(false);
  let textareaRef: HTMLTextAreaElement | undefined;
  let clarifyTextareaRef: HTMLTextAreaElement | undefined;

  const handleKeyDown = (e: KeyboardEvent, formRef: HTMLFormElement | undefined) => {
    if (e.key === "Enter") {
      if (isComposing() || (e as any).nativeEvent?.isComposing) {
        return;
      }
      if (e.shiftKey) {
        return;
      }
      e.preventDefault();

      const form = formRef || (e.currentTarget as HTMLTextAreaElement).form;
      const submitButton = form?.querySelector(
        'button[type="submit"]'
      ) as HTMLButtonElement | null;
      if (submitButton?.disabled) {
        return;
      }

      form?.requestSubmit();
    }
  };

  return (
    <form
      action={breakdownTask}
      method="post"
      class="task-prompt-shell"
      onSubmit={() => {
        console.log("[client] submitting breakdownTask", { granularity: granularity() });
      }}
    >
      <input type="hidden" name="granularity" value={granularity()} />
      <div class='task-prompt'>
        <div class="grow-wrap">
          <textarea 
            class={mode()} 
            ref={textareaRef} 
            name="task" 
            rows={2} 
            onInput={function () { (this.parentNode as HTMLElement).dataset.replicatedValue = this.value}} 
            onKeyDown={(e) => handleKeyDown(e, undefined)}
            onCompositionStart={() => setIsComposing(true)}
            onCompositionEnd={() => setIsComposing(false)}
            spellcheck="false"
          ></textarea>
        </div>
        <Show when={mode() === "default"}>
          <div class='task-prompt__bottom'>
            <div>
              <button type="button" onClick={() => setGranularityMenuOpen(!granularityMenuOpen())}><ScissorsLineDashed/></button>
              <Show when={granularityMenuOpen()}>
                <div class='granularity-options'>
                  <For each={["low", "medium", "high"] as Granularity[]}>
                    {(level) => (
                      <label>
                        <input
                          name="granularity"
                          type="radio"
                          checked={granularity() === level}
                          onChange={() => setGranularity(level)}
                          value={level}
                        />
                        {level}
                        <Show when={granularity() === level}>
                          <Checked />
                        </Show>
                      </label>
                    )}
                  </For>
                </div>
              </Show>
            </div>
            <button type="submit"><ArrowUp/></button>
          </div>
        </Show>
      </div>
      <Show when={mode() === "clarify"}>
        <output class='clarification-box'>
          <p>{clarification()}</p>
          <button type="button" onClick={() => setMode("default")}>Skip</button>
        </output>
        <div class='task-prompt clarification-form'>
          <div class="grow-wrap">
            <textarea 
              name="clarification" 
              ref={clarifyTextareaRef}
              rows={2} 
              onInput={function () { (this.parentNode as HTMLElement).dataset.replicatedValue = this.value}} 
              onKeyDown={(e) => handleKeyDown(e, undefined)}
              onCompositionStart={() => setIsComposing(true)}
              onCompositionEnd={() => setIsComposing(false)}
              spellcheck="false"
            ></textarea>
          </div>
          <div class='task-prompt__bottom'>
            <button type="submit"><ArrowUp/></button>
          </div>
        </div>
      </Show>
    </form>
  );
}
