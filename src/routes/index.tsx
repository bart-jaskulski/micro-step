import { Title } from "@solidjs/meta";
import TaskPrompt from "~/components/TaskPrompt";
import TasksList from "~/components/TasksList";

export default function Home() {
  return (
    <main>
      <Title>Hello World</Title>
      <TaskPrompt />
      <TasksList />
    </main>
  );
}
