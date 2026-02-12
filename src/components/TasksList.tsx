import { For, Show, type JSX } from "solid-js";
import { createStore } from "solid-js/store";
import { clientOnly } from "@solidjs/start";
import Minus from "lucide-solid/icons/minus";
import TaskItem from "./TaskItem";
import { DragProvider, useDrag, type DropPosition } from "./DragProvider";
import { moveTask, tasks as tasksStore, type TreeNode } from "~/stores/taskStore";

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

  const handleDrop = (draggedId: string, targetId: string, position: Exclude<DropPosition, null>) => {
    const tree = tasksStore();

    const nodeIndex = new Map<string, TreeNode>();
    const parentIndex = new Map<string, string | null>();

    const indexTree = (nodes: TreeNode[], parentId: string | null) => {
      nodes.forEach(node => {
        nodeIndex.set(node.id, node);
        parentIndex.set(node.id, parentId);
        indexTree(node.children, node.id);
      });
    };

    indexTree(tree, null);

    const draggedNode = nodeIndex.get(draggedId);
    const targetNode = nodeIndex.get(targetId);

    if (!draggedNode || !targetNode || draggedId === targetId) return;

    const isDescendant = (candidateId: string, ancestorId: string) => {
      let current: string | null | undefined = candidateId;
      while (current) {
        const parent = parentIndex.get(current);
        if (!parent) return false;
        if (parent === ancestorId) return true;
        current = parent;
      }
      return false;
    };

    if (isDescendant(targetId, draggedId)) return; // Prevent dropping into own subtree

    const getSiblings = (parentId: string | null) => {
      if (parentId === null) return tree;
      const parentNode = nodeIndex.get(parentId);
      return parentNode ? parentNode.children : [];
    };

    if (position === "inside") {
      const siblings = targetNode.children.filter(child => child.id !== draggedId);
      const last = siblings[siblings.length - 1];
      moveTask(draggedId, targetId, last?.rank, undefined);
      return;
    }

    const newParentId = parentIndex.get(targetId) ?? null;
    const siblings = getSiblings(newParentId).filter(child => child.id !== draggedId);
    const targetIndex = siblings.findIndex(child => child.id === targetId);
    if (targetIndex === -1) return;

    const insertIndex = position === "above" ? targetIndex : targetIndex + 1;
    const prev = siblings[insertIndex - 1];
    const next = siblings[insertIndex];

    moveTask(draggedId, newParentId, prev?.rank, next?.rank);
  };

  const renderOverlay = (id: string | null) => {
    if (!id) return null;

    const findNode = (nodes: TreeNode[]): TreeNode | undefined => {
      for (const node of nodes) {
        if (node.id === id) return node;
        const nested = findNode(node.children);
        if (nested) return nested;
      }
      return undefined;
    };

    const node = findNode(tasksStore());
    if (!node) return null;

    return (
      <div class="bg-white p-3 rounded-xl border border-stone-200 shadow-xl opacity-90 rotate-2 w-[300px]">
        {node.text}
      </div>
    );
  };

  const expansion: ExpansionState = {
    isExpanded: (id) => expandedMap[id] ?? !!props.defaultExpanded,
    setExpanded: (id, value) => setExpandedMap(id, value),
  };

  return (
    <DragProvider onDrop={handleDrop} renderOverlay={renderOverlay}>
      <TaskBranch
        {...props}
        level={props.level ?? 0}
        expansion={expansion}
      />
    </DragProvider>
  );
}

type TaskBranchProps = TasksListProps & { expansion: ExpansionState };

function TaskBranch(props: TaskBranchProps) {
  const level = props.level ?? 0;
  return (
    <ol class="flex flex-col gap-3">
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
  const drag = useDrag();
  const isExpanded = () => props.expansion.isExpanded(props.node.id);
  const hasChildren = () => props.node.children.length > 0;
  const isDragged = () => drag.state.draggedId === props.node.id;
  const isTarget = () => drag.state.targetId === props.node.id;

  const expand = () => {
    if (hasChildren()) {
      props.expansion.setExpanded(props.node.id, true);
    }
  };

  const collapse = () => props.expansion.setExpanded(props.node.id, false);

  const dropStyles = () => {
    if (!isTarget()) return "";
    const pos = drag.state.dropPosition;
    if (pos === "above") return "border-t-4 border-stone-800 -mt-1";
    if (pos === "below") return "border-b-4 border-stone-800 -mb-1";
    if (pos === "inside") return "ring-2 ring-stone-400 ring-offset-2 rounded-xl";
    return "";
  };

  return (
    <li
      class={`relative transition-all ${isDragged() ? 'opacity-30' : ''} ${dropStyles()}`}
      data-task-id={props.node.id}
    >
      <div class="relative z-10 group/card">
        <TaskItem {...props.node}/>
        
        {/* Stack Trigger (Expand Button when collapsed) */}
        <Show when={hasChildren() && !isExpanded()}>
          <div 
            class="absolute bottom-[-6px] left-1 right-1 h-3 bg-white border border-stone-200 border-t-0 rounded-b-xl cursor-pointer shadow-sm hover:bg-stone-50 hover:translate-y-[2px] transition-all z-0"
            onClick={expand}
            title="Expand subtasks"
          />
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
              fallback={props.fallback}
            />
          </div>
        </div>
      </Show>
    </li>
  );
}
