import { createContext, useContext, type JSX, type ParentComponent, Show, batch, onCleanup } from "solid-js";
import { createStore } from "solid-js/store";
import { Portal } from "solid-js/web";
import { listSortMode } from "~/stores/preferencesStore";

export type DropPosition = "above" | "below" | "inside" | null;

type DragState = {
  status: "IDLE" | "PRESSED" | "DRAGGING" | "DROPPING";
  draggedId: string | null;
  targetId: string | null;
  dropPosition: DropPosition;
  startCoord: { x: number; y: number };
  currentCoord: { x: number; y: number };
  grabOffset: { x: number; y: number };
  originalRect: DOMRect | null;
};

type DragContextValue = {
  state: DragState;
  startDrag: (event: PointerEvent, id: string, el: HTMLElement) => void;
};

type DragProviderProps = {
  onDrop: (draggedId: string, targetId: string, position: Exclude<DropPosition, null>) => void;
  renderOverlay?: (id: string | null) => JSX.Element | null;
};

const DragContext = createContext<DragContextValue>();

const MOVEMENT_THRESHOLD = 5;
const HOT_ZONE = 100;

const calculateDropPosition = (pointerY: number, rect: DOMRect): Exclude<DropPosition, null> => {
  const relativeY = (pointerY - rect.top) / rect.height;
  if (relativeY < 0.25) return "above";
  if (relativeY > 0.75) return "below";
  return "inside";
};

export const DragProvider: ParentComponent<DragProviderProps> = (props) => {
  const [state, setState] = createStore<DragState>({
    status: "IDLE",
    draggedId: null,
    targetId: null,
    dropPosition: null,
    startCoord: { x: 0, y: 0 },
    currentCoord: { x: 0, y: 0 },
    grabOffset: { x: 0, y: 0 },
    originalRect: null,
  });

  let autoScrollFrame: number | undefined;
  let announcerTimeout: number | undefined;

  const announce = (message: string) => {
    const announcer = document.getElementById("dnd-announcer");
    if (!announcer) return;
    announcer.textContent = message;
    if (announcerTimeout) {
      clearTimeout(announcerTimeout);
    }
    announcerTimeout = window.setTimeout(() => {
      announcer.textContent = "";
    }, 800);
  };

  const startAutoScroll = () => {
    const loop = () => {
      if (state.status !== "DRAGGING") return;

      const { y } = state.currentCoord;
      const height = window.innerHeight;

      if (y > height - HOT_ZONE) {
        window.scrollBy(0, 6 + (y - (height - HOT_ZONE)) / 8);
      } else if (y < HOT_ZONE) {
        window.scrollBy(0, -(6 + (HOT_ZONE - y) / 8));
      }

      autoScrollFrame = requestAnimationFrame(loop);
    };
    loop();
  };

  const resetState = () => {
    batch(() => {
      setState({
        status: "IDLE",
        draggedId: null,
        targetId: null,
        dropPosition: null,
        startCoord: { x: 0, y: 0 },
        currentCoord: { x: 0, y: 0 },
        grabOffset: { x: 0, y: 0 },
        originalRect: null,
      });
    });
  };

  const handlePointerMove = (event: PointerEvent) => {
    if (state.status === "PRESSED") {
      const dist = Math.hypot(
        event.clientX - state.startCoord.x,
        event.clientY - state.startCoord.y,
      );

      if (dist > MOVEMENT_THRESHOLD) {
        batch(() => {
          setState("status", "DRAGGING");
          setState("currentCoord", { x: event.clientX, y: event.clientY });
        });
        startAutoScroll();
        announce("Dragging");
      }
      return;
    }

    if (state.status !== "DRAGGING") return;

    event.preventDefault();
    setState("currentCoord", { x: event.clientX, y: event.clientY });

    const targets = document.elementsFromPoint(event.clientX, event.clientY);
    const targetEl = targets.find((el) => el.hasAttribute("data-task-id")) as HTMLElement | undefined;

    if (!targetEl) {
      setState("targetId", null);
      setState("dropPosition", null);
      return;
    }

    const targetId = targetEl.getAttribute("data-task-id");
    if (!targetId || targetId === state.draggedId) return;

    const rect = targetEl.getBoundingClientRect();
    const position = calculateDropPosition(event.clientY, rect);

    batch(() => {
      setState("targetId", targetId);
      setState("dropPosition", position);
    });
  };

  const finishDrag = (event: PointerEvent) => {
    if (autoScrollFrame) cancelAnimationFrame(autoScrollFrame);
    window.removeEventListener("pointermove", handlePointerMove);
    window.removeEventListener("pointerup", finishDrag);

    if (state.status === "DRAGGING" && state.targetId && state.dropPosition) {
      props.onDrop(state.draggedId!, state.targetId, state.dropPosition);
    }

    if (state.status === "DRAGGING") {
      setState("status", "DROPPING");
      announce("Drop complete");
      window.setTimeout(resetState, 220);
    } else {
      resetState();
    }

    if (event.target instanceof Element) {
      event.target.releasePointerCapture(event.pointerId);
    }
  };

  const startDrag = (event: PointerEvent, id: string, el: HTMLElement) => {
    if (listSortMode() !== "manual") {
      announce("Switch to manual sort to reorder tasks");
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    el.setPointerCapture(event.pointerId);

    const rect = el.closest("[data-task-id]")?.getBoundingClientRect() ?? el.getBoundingClientRect();

    batch(() => {
      setState({
        status: "PRESSED",
        draggedId: id,
        targetId: null,
        dropPosition: null,
        startCoord: { x: event.clientX, y: event.clientY },
        currentCoord: { x: event.clientX, y: event.clientY },
        grabOffset: { x: event.clientX - rect.left, y: event.clientY - rect.top },
        originalRect: rect,
      });
    });

    window.addEventListener("pointermove", handlePointerMove, { passive: false });
    window.addEventListener("pointerup", finishDrag);
  };

  onCleanup(() => {
    if (autoScrollFrame) cancelAnimationFrame(autoScrollFrame);
    if (announcerTimeout) clearTimeout(announcerTimeout);
    window.removeEventListener("pointermove", handlePointerMove);
    window.removeEventListener("pointerup", finishDrag);
  });

  const overlayStyle = () => {
    if (!state.originalRect) return {};

    const common = {
      width: `${state.originalRect.width}px`,
      "z-index": "9999",
      "pointer-events": "none",
      transition: "transform 160ms cubic-bezier(0.25, 0.9, 0.3, 1), opacity 160ms ease",
    } as const;

    if (state.status === "DROPPING") {
      return {
        ...common,
        transform: `translate3d(${state.originalRect.left}px, ${state.originalRect.top}px, 0) scale(1)`,
        opacity: 0.6,
      };
    }

    const x = state.currentCoord.x - state.grabOffset.x;
    const y = state.currentCoord.y - state.grabOffset.y;

    return {
      ...common,
      transform: `translate3d(${x}px, ${y}px, 0) scale(${state.status === "PRESSED" ? 0.985 : 1.01})`,
      opacity: state.status === "PRESSED" ? 0.75 : 1,
    };
  };

  return (
    <DragContext.Provider value={{ state, startDrag }}>
      {props.children}
      <Portal>
        <Show when={state.status !== "IDLE"}>
          <div
            class="drag-overlay"
            style={{
              position: "fixed",
              top: "0",
              left: "0",
              ...overlayStyle(),
            }}
          >
            <Show when={props.renderOverlay} fallback={
              <div class="drag-overlay__card">
                Dragging
              </div>
            }>
              {props.renderOverlay ? props.renderOverlay(state.draggedId) : null}
            </Show>
          </div>
        </Show>
        <div id="dnd-announcer" class="sr-only" aria-live="assertive" role="status" />
      </Portal>
    </DragContext.Provider>
  );
};

export const useDrag = () => {
  const ctx = useContext(DragContext);
  if (!ctx) throw new Error("useDrag must be used within DragProvider");
  return ctx;
};
