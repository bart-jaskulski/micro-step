import Axe from "lucide-solid/icons/axe";
import GripVertical from "lucide-solid/icons/grip-vertical";
import X from "lucide-solid/icons/x";
import type { Task } from "~/stores/taskStore";

import './TaskItem.css';

export default function TaskItem(props: Task) {
  return (
    <div class="task-item">
      <GripVertical />
      <input type="checkbox" checked={props.completed} />
      <p>{props.text}</p>
      {props.dueAt && <small>Due: {new Date(props.dueAt).toLocaleDateString()}</small>}
      <button><Axe /></button>
      <button><X /></button>
    </div>
  );
}
