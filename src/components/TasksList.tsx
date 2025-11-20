import { For } from "solid-js";
import TaskItem from "./TaskItem";
import { taskStore } from "../taskStore";
import './TasksList.css';

export default function TasksList() {
  return (
    <div class="tasks-list">
      <For each={taskStore.tasks}>
        {(task => (
          <TaskItem {...task}/>
        ))}
      </For>
    </div>
  );
}
