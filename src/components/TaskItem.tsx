import type { Task } from "../taskStore";
import X from "lucide-solid/icons/x";
import Axe from "lucide-solid/icons/axe";
import './TaskItem.css';

export default function TaskItem(props: Task) {
  return (
    <div class="task-item">
      <input type="checkbox" checked={props.isCompleted} />
      <p>{props.content}</p>
      {props.dueDate && <small>Due: {new Date(props.dueDate).toLocaleDateString()}</small>}
      <button><Axe /></button>
      <button><X /></button>
    </div>
  );
}
