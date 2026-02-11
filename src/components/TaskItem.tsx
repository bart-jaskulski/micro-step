import { Show, createEffect, createSignal, on } from "solid-js";
import GripVertical from "lucide-solid/icons/grip-vertical";
import Trash2 from "lucide-solid/icons/trash-2";
import CornerDownRight from "lucide-solid/icons/corner-down-right";
import Calendar from "lucide-solid/icons/calendar";
import Check from "lucide-solid/icons/check";
import { deleteTask, updateTask } from "~/stores/taskStore";
import type { Task } from "~/stores/taskStore";
import { useDrag } from "./DragProvider";

type TaskItemProps = Task & {
  dragActivators?: Record<string, (event: HTMLElementEventMap[keyof HTMLElementEventMap]) => void>;
};

export default function TaskItem(props: TaskItemProps) {
  const drag = useDrag();
  const [isEditing, setIsEditing] = createSignal(false);
  const [draft, setDraft] = createSignal(props.text);
  let inputRef: HTMLTextAreaElement | undefined;

  createEffect(on(isEditing, (editing) => {
    if (editing && inputRef) {
      // Auto-resize on initial focus
      inputRef.style.height = 'auto';
      inputRef.style.height = inputRef.scrollHeight + 'px';
      
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

  const autoResize = (el: HTMLTextAreaElement) => {
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 'px';
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    if (date.toDateString() === today.toDateString()) return 'Today';
    if (date.toDateString() === tomorrow.toDateString()) return 'Tomorrow';
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  return (
    <div class="relative w-full group/item">
      <div class="relative z-10 bg-white rounded-xl border border-stone-200 p-3.5 flex items-start gap-3 transition-all hover:shadow-md hover:border-stone-300">
        
        {/* Drag Handle */}
        <div 
          class="text-stone-300 cursor-grab active:cursor-grabbing mt-1.5 hover:text-stone-500 shrink-0 touch-none"
          role="button"
          aria-label="Drag to reorder"
          onPointerDown={(event) => drag.startDrag(event, props.id, event.currentTarget as HTMLElement)}
        >
          <GripVertical class="w-4 h-4" />
        </div>

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
            <div class="flex items-start shrink-0 opacity-0 group-hover/item:opacity-100 transition-opacity">
              <button 
                // Placeholder for add subtask logic if implemented later, or just visual for now
                onClick={(e) => { e.stopPropagation(); /* Logic to add subtask */ }}
                class="text-stone-300 hover:text-stone-600 p-1.5 rounded-md hover:bg-stone-100 transition-colors hidden" 
                title="Add Subtask"
              >
                <CornerDownRight class="w-4 h-4" />
              </button>
              <button 
                onClick={(e) => { e.stopPropagation(); deleteTask(props.id); }}
                class="text-stone-300 hover:text-red-400 p-1.5 rounded-md hover:bg-stone-100 transition-colors ml-1"
                title="Delete"
              >
                <Trash2 class="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Date Badge */}
          <div class="flex items-center">
            <Show when={props.dueAt} fallback={
              <div class="flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium border border-transparent text-stone-300 hover:bg-stone-50 hover:text-stone-400 opacity-60 hover:opacity-100 transition-all cursor-pointer">
                 <Calendar class="w-3 h-3" />
                 <span>Set date</span>
                 {/* Date picker logic could go here */}
              </div>
            }>
              <div class="flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium border bg-stone-50 border-stone-200 text-stone-500 transition-all cursor-pointer">
                <Calendar class="w-3 h-3" />
                <span>{formatDate(props.dueAt)}</span>
              </div>
            </Show>
          </div>
        </div>
      </div>
    </div>
  );
}
