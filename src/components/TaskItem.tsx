import { Show, createEffect, createSignal, on, onCleanup } from "solid-js";
import { Portal } from "solid-js/web";
import Trash2 from "lucide-solid/icons/trash-2";
import Calendar from "lucide-solid/icons/calendar";
import Check from "lucide-solid/icons/check";
import { formatDateInputValue, formatDueDateLabel, normalizeDateOnlyInput } from "~/lib/dates";
import { deleteTask, updateTask } from "~/stores/taskStore";
import type { Task } from "~/stores/taskStore";

type TaskItemProps = Task;

export default function TaskItem(props: TaskItemProps) {
  const [isEditing, setIsEditing] = createSignal(false);
  const [isEditingDueDate, setIsEditingDueDate] = createSignal(false);
  const [dueDateAnchor, setDueDateAnchor] = createSignal<{ top: number; left: number; width: number; height: number } | null>(null);
  const [draft, setDraft] = createSignal(props.text);
  let inputRef: HTMLTextAreaElement | undefined;
  let dueDateInputRef: HTMLInputElement | undefined;
  let dueDateButtonRef: HTMLButtonElement | undefined;

  createEffect(on(isEditing, (editing) => {
    if (editing && inputRef) {
      inputRef.style.height = 'auto';
      inputRef.style.height = inputRef.scrollHeight + 'px';
      
      queueMicrotask(() => {
        inputRef?.focus();
        inputRef?.select();
      });
    }
  }));

  const updateDueDateAnchor = () => {
    if (!dueDateButtonRef) {
      return;
    }

    const rect = dueDateButtonRef.getBoundingClientRect();
    setDueDateAnchor({
      top: rect.top,
      left: rect.left,
      width: rect.width,
      height: rect.height,
    });
  };

  const closeDueDateEditor = () => {
    setIsEditingDueDate(false);
    setDueDateAnchor(null);
  };

  createEffect(() => {
    if (!isEditingDueDate()) {
      return;
    }

    updateDueDateAnchor();

    const handleViewportChange = () => {
      updateDueDateAnchor();
    };

    document.addEventListener("scroll", handleViewportChange, true);
    window.addEventListener("resize", handleViewportChange);

    let frameOne = 0;
    let frameTwo = 0;

    frameOne = window.requestAnimationFrame(() => {
      frameTwo = window.requestAnimationFrame(() => {
        dueDateInputRef?.showPicker?.() ?? dueDateInputRef?.focus();
      });
    });

    onCleanup(() => {
      if (frameOne) {
        window.cancelAnimationFrame(frameOne);
      }
      if (frameTwo) {
        window.cancelAnimationFrame(frameTwo);
      }
      document.removeEventListener("scroll", handleViewportChange, true);
      window.removeEventListener("resize", handleViewportChange);
    });
  });

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

  const autoResize = (el: HTMLTextAreaElement) => {
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 'px';
  };

  const handleDueDateChange = (value: string) => {
    const dueAt = normalizeDateOnlyInput(value);
    updateTask(props.id, { dueAt });
    closeDueDateEditor();
  };

  return (
    <div class="relative w-full group/item">
      <div class="relative z-10 bg-white rounded-xl border border-stone-200 p-3.5 flex items-start gap-3 transition-all hover:shadow-md hover:border-stone-300">
        {/* Checkbox */}
        <div class="pt-1 shrink-0">
          <label class="relative flex items-center justify-center cursor-pointer group/check">
            <input 
              type="checkbox" 
              class="sr-only peer"
              checked={props.completed}
              onChange={(event) => updateTask(props.id, { completed: event.currentTarget.checked })}
            />
            <div class="w-5 h-5 border-2 border-stone-300 rounded-md transition-colors peer-checked:bg-stone-600 peer-checked:border-stone-600 group-hover/check:border-stone-400 flex items-center justify-center">
              <Check class="w-3 h-3 text-white opacity-0 peer-checked:opacity-100 transition-opacity pointer-events-none" stroke-width={3} />
            </div>
          </label>
        </div>

        {/* Content */}
        <div class="flex-1 min-w-0 flex flex-col gap-1">
          <div class="flex items-start justify-between gap-2">
            
            <Show when={!isEditing()} fallback={
              <textarea
                ref={inputRef}
                class="w-full bg-transparent font-medium text-lg leading-tight outline-none text-stone-800 resize-none overflow-hidden"
                rows={1}
                value={draft()}
                onInput={(event) => {
                  setDraft(event.currentTarget.value);
                  autoResize(event.currentTarget);
                }}
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
              <div 
                class={`w-full font-medium text-lg leading-tight text-stone-800 cursor-text break-words ${props.completed ? 'line-through text-stone-400' : ''}`}
                onClick={() => setIsEditing(true)}
              >
                {props.text}
              </div>
            </Show>

            {/* Actions */}
            <div class="flex items-start shrink-0 opacity-100 sm:opacity-0 sm:group-hover/item:opacity-100 transition-opacity">
              <button 
                onClick={(e) => { e.stopPropagation(); deleteTask(props.id); }}
                class="text-stone-300 hover:text-red-400 p-1.5 rounded-md hover:bg-stone-100 transition-colors ml-1"
                title="Delete"
                aria-label="Delete task"
              >
                <Trash2 class="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Date Badge */}
          <div class="relative flex items-center">
            <button
              ref={dueDateButtonRef}
              type="button"
              onClick={() => setIsEditingDueDate(true)}
              class={`flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium transition-colors ${
                props.dueAt === null
                  ? "border border-transparent text-stone-300 opacity-80 hover:bg-stone-50 hover:text-stone-500"
                  : "border bg-stone-50 border-stone-200 text-stone-500 hover:border-stone-300"
              }`}
              aria-label={props.dueAt === null ? "Set due date" : "Edit due date"}
            >
              <Calendar class="w-3 h-3" />
              <span>{props.dueAt === null ? "Set date" : formatDueDateLabel(props.dueAt)}</span>
            </button>
          </div>
        </div>
      </div>

      <Show when={isEditingDueDate() && dueDateAnchor()}>
        {(anchor) => (
          <Portal>
            <input
              ref={dueDateInputRef}
              type="date"
              aria-label="Choose due date"
              class="fixed z-[90] opacity-0 pointer-events-none"
              style={{
                top: `${anchor().top}px`,
                left: `${anchor().left}px`,
                width: `${anchor().width}px`,
                height: `${anchor().height}px`,
              }}
              value={formatDateInputValue(props.dueAt)}
              onChange={(event) => handleDueDateChange(event.currentTarget.value)}
              onBlur={() => closeDueDateEditor()}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  closeDueDateEditor();
                }
              }}
            />
          </Portal>
        )}
      </Show>
    </div>
  );
}
