import { Title } from "@solidjs/meta";
import TaskPrompt from "~/components/TaskPrompt";
import TasksList from "~/components/TasksList";
import { tasks } from "~/stores/taskStore";

export default
function Home() {
  return (
    <main>
      <Title>Hello World</Title>
      <TaskPrompt />
      <TasksList tasks={tasks()} fallback={<div>Loading...</div>} />
    </main>
  );
}
