import { For, Show, type JSX } from "solid-js";
import { createStore } from "solid-js/store";
import { clientOnly } from "@solidjs/start";
import Minus from "lucide-solid/icons/minus";
import TaskItem from "./TaskItem";
import { type TreeNode } from "~/stores/taskStore";
import './TasksList.css';

export default clientOnly(async () => ({ default: TasksList }), { lazy: true });

type TasksListProps = {
  tasks: TreeNode[];
  level?: number;
  defaultExpanded?: boolean;
  fallback?: JSX.Element;
};

type ExpansionState = {
  isExpanded: (id: string) => boolean;
  setExpanded: (id: string, value: boolean) => void;
};

function TasksList(props: TasksListProps) {
  const [expandedMap, setExpandedMap] = createStore<Record<string, boolean>>({});

  const expansion: ExpansionState = {
    isExpanded: (id) => expandedMap[id] ?? !!props.defaultExpanded,
    setExpanded: (id, value) => setExpandedMap(id, value),
  };

  return (
    <TaskBranch
      {...props}
      level={props.level ?? 0}
      expansion={expansion}
    />
  );
}

type TaskBranchProps = TasksListProps & { expansion: ExpansionState };

function TaskBranch(props: TaskBranchProps) {
  const level = props.level ?? 0;
  return (
    <ol class="tasks-list" data-level={level}>
      <For each={props.tasks} fallback={props.fallback}>
        {(task => (
          <TaskNode
            node={task}
            level={level}
            defaultExpanded={props.defaultExpanded}
            expansion={props.expansion}
            fallback={props.fallback}
          />
        ))}
      </For>
    </ol>
  );
}

type TaskNodeProps = {
  node: TreeNode;
  level?: number;
  defaultExpanded?: boolean;
  fallback?: JSX.Element;
  expansion: ExpansionState;
};

function TaskNode(props: TaskNodeProps) {
  const isExpanded = () => props.expansion.isExpanded(props.node.id);
  const hasChildren = () => props.node.children.length > 0;

  const expand = () => {
    if (hasChildren()) {
      props.expansion.setExpanded(props.node.id, true);
    }
  };

  const collapse = () => props.expansion.setExpanded(props.node.id, false);

  return (
    <li
      class="task-node"
      classList={{
        "is-expanded": isExpanded(),
        "has-children": hasChildren(),
      }}
    >
      <div class="task-node__card">
        <TaskItem {...props.node}/>
        <Show when={hasChildren()}>
          <button
            type="button"
            class="shelf-deck"
            aria-expanded={isExpanded()}
            aria-label="Expand subtasks"
            onClick={expand}
            disabled={isExpanded()}
          >
            <span aria-hidden="true" class="shelf-card" />
            <span aria-hidden="true" class="shelf-card" />
          </button>
        </Show>
      </div>

      <Show when={hasChildren()}>
        <div class="node-children">
          <div aria-hidden="true" class="spine-line" />
          <button
            type="button"
            class="spine-tab"
            aria-label="Collapse subtasks"
            tabIndex={isExpanded() ? 0 : -1}
            onClick={collapse}
          >
            <Minus />
          </button>
          <div class="node-children-inner">
            <TaskBranch
              tasks={props.node.children}
              level={(props.level ?? 0) + 1}
              defaultExpanded={props.defaultExpanded}
              expansion={props.expansion}
              fallback={props.fallback}
            />
          </div>
        </div>
      </Show>
    </li>
  );
}
