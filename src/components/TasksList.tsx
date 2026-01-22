import { For, Show, type JSX } from "solid-js";
import { createStore } from "solid-js/store";
import { clientOnly } from "@solidjs/start";
import Minus from "lucide-solid/icons/minus";
import TaskItem from "./TaskItem";
import { DragProvider, useDrag, type DropPosition } from "./DragProvider";
import { moveTask, tasks as tasksStore, type TreeNode } from "~/stores/taskStore";
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
      <div class="drag-overlay__card">
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

  return (
    <li
      class="task-node"
      classList={{
        "is-expanded": isExpanded(),
        "has-children": hasChildren(),
        "is-dragged": isDragged(),
        "is-drop-target": isTarget(),
        "drop-above": isTarget() && drag.state.dropPosition === "above",
        "drop-below": isTarget() && drag.state.dropPosition === "below",
        "drop-inside": isTarget() && drag.state.dropPosition === "inside",
      }}
      data-task-id={props.node.id}
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
        <div class="node-children-wrapper">
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
          <div class="node-children-animator">
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
        </div>
      </Show>
    </li>
  );
}
