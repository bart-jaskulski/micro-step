import { createEffect, createSignal, For, Show } from "solid-js"
import { useSubmission } from "@solidjs/router";
import ArrowUp from "lucide-solid/icons/arrow-up"
import ScissorsLineDashed from "lucide-solid/icons/scissors-line-dashed"
import { addTask } from "~/stores/taskStore"
import { breakdownTask } from "~/actions/taskActions"
import "./TaskPrompt.css"

type Granularity = "low" | "medium" | "high"

export default function TaskPrompt() {
  const [mode, setMode] = createSignal<"default" | "clarify">("default");
  const submission = useSubmission(breakdownTask);
  const [clarification, setClarification] = createSignal<string>("");

  createEffect(async () => {
    if (submission.result) {
      switch (submission.result.action) {
        case "createTasks":
          const { tasks } = submission.result;
          for (const t of tasks) {
            const transition = document.startViewTransition(() => {
              addTask(t)
            });

            await transition.finished;
          }
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
  let textareaRef: HTMLTextAreaElement | undefined;

  return (
    <form action={breakdownTask} method="post">
      <input type="hidden" name="granularity" value={granularity()} />
      <div class='task-prompt'>
        <div class="grow-wrap">
          <textarea class={mode()} ref={textareaRef} name="task" rows={2} onInput={function () { this.parentNode.dataset.replicatedValue = this.value}} spellcheck="false"></textarea>
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
            <textarea name="clarification" rows={2} onInput={function () { this.parentNode.dataset.replicatedValue = this.value}} spellcheck="false"></textarea>
          </div>
          <div class='task-prompt__bottom'>
            <button type="submit"><ArrowUp/></button>
          </div>
        </div>
      </Show>
    </form>
  );
}
