import Axe from "lucide-solid/icons/axe";
import GripVertical from "lucide-solid/icons/grip-vertical";
import X from "lucide-solid/icons/x";
import type { Task } from "~/stores/taskStore";

import './TaskItem.css';

export default function TaskItem(props: Task) {
  return (
    <div class="task-item">
      <GripVertical class="handle" />
      <div class="content">
        <input class="task-item__checkbox" type="checkbox" checked={props.completed} />
        <div class="task-item__body">
          <p class="text">{props.text}</p>
          {props.dueAt && (
            <small class="due">Due {new Date(props.dueAt).toLocaleDateString()}</small>
          )}
        </div>
        <div class="task-item__actions">
          <button class="task-item__action" type="button" aria-label="Split or refine task">
            <Axe />
          </button>
          <button class="task-item__action task-item__action--remove" type="button" aria-label="Remove task">
            <X />
          </button>
        </div>
      </div>
    </div>
  );
}
