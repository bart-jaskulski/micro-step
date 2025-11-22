import { For } from "solid-js";
import { clientOnly } from "@solidjs/start";
import TaskItem from "./TaskItem";
import { tasks } from "~/stores/taskStore";
import './TasksList.css';

export default clientOnly(async () => ({ default: TasksList }), { lazy: true });

function TasksList() {
  return (
    <div class="tasks-list">
      <For each={tasks()}>
        {(task => (
          <TaskItem {...task}/>
        ))}
      </For>
    </div>
  );
}
