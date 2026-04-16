import { For, Show, type JSX } from "solid-js";
import { clientOnly } from "@solidjs/start";
import Minus from "lucide-solid/icons/minus";
import TaskItem from "./TaskItem";
import {
  isTaskExpanded,
  setTaskExpanded,
  type TreeNode,
} from "~/stores/taskStore";

export default clientOnly(async () => ({ default: TasksList }), { lazy: true });

type TasksListProps = {
  tasks: TreeNode[];
  level?: number;
  defaultExpanded?: boolean;
  emptyState?: JSX.Element;
};

type ExpansionState = {
  isExpanded: (id: string) => boolean;
  setExpanded: (id: string, value: boolean) => void;
};

export function TasksList(props: TasksListProps) {
  const expansion: ExpansionState = {
    isExpanded: (id) => isTaskExpanded(id) || !!props.defaultExpanded,
    setExpanded: (id, value) => setTaskExpanded(id, value),
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
    <ol class="flex flex-col gap-3">
      <For each={props.tasks} fallback={props.emptyState}>
        {(task => (
          <TaskNode
            node={task}
            level={level}
            defaultExpanded={props.defaultExpanded}
            expansion={props.expansion}
            emptyState={props.emptyState}
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
  emptyState?: JSX.Element;
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
    <li class="relative" data-task-id={props.node.id}>
      <div class={`relative z-10 group/card ${hasChildren() && !isExpanded() ? "pb-5" : ""}`}>
        <TaskItem {...props.node}/>

        <Show when={hasChildren() && !isExpanded()}>
          <button
            type="button"
            class="absolute inset-x-2 bottom-0 h-7 rounded-b-[18px] text-stone-500 transition-all hover:translate-y-[1px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:ring-offset-2"
            onClick={expand}
            aria-label={`Show ${props.node.children.length} subtasks`}
          >
            <span class="absolute inset-x-3 bottom-[8px] h-4 rounded-b-[14px] border border-stone-200 bg-stone-100" />
            <span class="absolute inset-x-2 bottom-[4px] h-4 rounded-b-[16px] border border-stone-200 bg-stone-50" />
            <span class="absolute inset-x-0 bottom-0 flex h-5 items-center justify-center rounded-b-[18px] border border-stone-200 border-t-0 bg-white/95 text-[11px] font-medium tracking-[0.02em] shadow-sm">
              {props.node.children.length} step{props.node.children.length === 1 ? "" : "s"}
            </span>
          </button>
        </Show>
      </div>

      <Show when={hasChildren() && isExpanded()}>
        <div class="relative pl-4 mt-2 ml-3.5 border-l-2 border-[#E7E5E4] pb-2 animate-in slide-in-from-top-2 duration-200">
          <button 
            onClick={collapse} 
            class="absolute -left-[9px] -top-1 bg-stone-100 hover:bg-stone-200 text-stone-500 border border-stone-200 rounded-full w-4 h-4 flex items-center justify-center z-20"
            aria-label="Collapse subtasks"
          >
            <Minus class="w-2.5 h-2.5" />
          </button>
          
          <div class="pt-2">
            <TaskBranch
              tasks={props.node.children}
              level={(props.level ?? 0) + 1}
              defaultExpanded={props.defaultExpanded}
              expansion={props.expansion}
              emptyState={props.emptyState}
            />
          </div>
        </div>
      </Show>
    </li>
  );
}
