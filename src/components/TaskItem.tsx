import { Show, createEffect, createSignal, on } from "solid-js";
import Axe from "lucide-solid/icons/axe";
import GripVertical from "lucide-solid/icons/grip-vertical";
import X from "lucide-solid/icons/x";
import { deleteTask, updateTask } from "~/stores/taskStore";
import type { Task } from "~/stores/taskStore";

import './TaskItem.css';

type TaskItemProps = Task & {
  dragActivators?: Record<string, (event: HTMLElementEventMap[keyof HTMLElementEventMap]) => void>;
};

export default function TaskItem(props: TaskItemProps) {
  const [isEditing, setIsEditing] = createSignal(false);
  const [draft, setDraft] = createSignal(props.text);
  let inputRef: HTMLInputElement | undefined;

  createEffect(on(isEditing, (editing) => {
    if (editing && inputRef) {
      queueMicrotask(() => {
        inputRef?.focus();
        inputRef?.select();
      });
    }
  }));

  const save = () => {
    const next = draft().trim();
    setIsEditing(false);
    if (next && next !== props.text) {
      updateTask(props.id, { text: next });
    } else {
      setDraft(props.text);
    }
  };

  const cancel = () => {
    setDraft(props.text);
    setIsEditing(false);
  };

  return (
    <div class="task-item">
      <GripVertical class="handle" />
      <div class="content">
        <input
          class="task-item__checkbox"
          type="checkbox"
          checked={props.completed}
          onChange={(event) => updateTask(props.id, { completed: event.currentTarget.checked })}
        />
        <div class="task-item__body">
          <Show when={!isEditing()} fallback={
            <input
              ref={inputRef}
              class="task-item__edit"
              type="text"
              value={draft()}
              onInput={(event) => setDraft(event.currentTarget.value)}
              onBlur={save}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  save();
                }
                if (event.key === "Escape") {
                  event.preventDefault();
                  cancel();
                }
              }}
            />
          }>
            <button
              type="button"
              class="task-item__title"
              onClick={() => setIsEditing(true)}
            >
              {props.text}
            </button>
          </Show>
          {props.dueAt && (
            <small class="due">Due {new Date(props.dueAt).toLocaleDateString()}</small>
          )}
        </div>
        <div class="task-item__actions">
          <button class="task-item__action" type="button" aria-label="Split or refine task">
            <Axe />
          </button>
          <button
            class="task-item__action task-item__action--remove"
            type="button"
            aria-label="Remove task"
            onClick={() => deleteTask(props.id)}
          >
            <X />
          </button>
        </div>
      </div>
    </div>
  );
}
