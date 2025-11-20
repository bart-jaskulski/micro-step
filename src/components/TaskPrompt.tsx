import { createSignal, For, Show } from "solid-js"
import ArrowUp from "lucide-solid/icons/arrow-up"
import ScissorsLineDashed from "lucide-solid/icons/scissors-line-dashed"
import { addTask } from "../taskStore"
import "./TaskPrompt.css"

type Granularity = "low" | "medium" | "high"

export default function TaskPrompt() {
  const [granularity, setGranularity] = createSignal<Granularity>("medium");
  const [granularityMenuOpen, setGranularityMenuOpen] = createSignal(false);
  let formRef: HTMLFormElement | undefined;
  let textareaRef: HTMLTextAreaElement | undefined;

  const handler = async (e: SubmitEvent) => {
    console.log("Submitting with granularity:", granularity());
    e.preventDefault();
    console.log(JSON.stringify(Object.fromEntries(new FormData(formRef!).entries())));

    const result = await fetch("/api/task", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(Object.fromEntries(new FormData(formRef!).entries())),
    });

    formRef!.reset();

    const response = await result.json();

    for (const part of response) {
      if (part.type === "tool-call" && part.toolName === "createTasks") {
        for (const t of part.input.tasks) {
          const transition = document.startViewTransition(() => {
            addTask(t)
          });

          await transition.finished;
        }
      }
    }
  };

  return (
    <form ref={formRef} onSubmit={handler} method="post" action="/api/task" class='task-prompt'>
      <div class="grow-wrap">
      <textarea ref={textareaRef} name="task" rows={2} onInput={function () { this.parentNode.dataset.replicatedValue = this.value}} spellcheck="false"></textarea>
      </div>
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
                      value={level}
                      bool:checked={granularity() === level}
                      class={granularity() === level ? "active" : ""}
                      onChange={() => setGranularity(level)}
                    />
                    {level}
                  </label>
                )}
              </For>
            </div>
          </Show>
        </div>
        <button><ArrowUp/></button>
      </div>
    </form>
  );
}
