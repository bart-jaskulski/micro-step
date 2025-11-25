import * as Y from "yjs";
import { IndexeddbPersistence } from "y-indexeddb";
import { createMemo } from "solid-js";
import { createStore, reconcile } from "solid-js/store";
import { isServer } from "solid-js/web";
import { LexoRank } from "lexorank";
import { generateKey, importKey } from "~/lib/crypto";
import { EncryptedWsProvider } from "~/lib/encryptedWsProvider";

const nanoid = () => {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return Array.from(array, byte => ("0" + byte.toString(16)).slice(-2)).join("");
};

export type Task = {
  id: string;
  parentId: string | null;
  text: string;
  completed: boolean;
  createdAt: number;
  dueAt: number | null;
  rank: string;
};

export type TreeNode = Task & {
  children: TreeNode[];
  effectiveDueDate: number | null; // Bubbled up date
};

type DeviceInfo = {
  id: string;
  label: string;
  lastSeen: number;
};

const compareDueThenRank = (a: Task, b: Task) => {
  const aDue = a.dueAt ?? Number.POSITIVE_INFINITY;
  const bDue = b.dueAt ?? Number.POSITIVE_INFINITY;
  if (aDue !== bDue) return aDue - bDue;
  return a.rank.localeCompare(b.rank);
};

const computeInitialRank = (parentId: string | null, dueAt: number | null) => {
  const siblings = Object.values(state.tasks).filter(t => t.parentId === parentId);

  if (!siblings.length) {
    return LexoRank.middle().toString();
  }

  const sorted = siblings.slice().sort(compareDueThenRank);
  const targetIndex = sorted.findIndex(sibling => {
    const siblingDue = sibling.dueAt ?? Number.POSITIVE_INFINITY;
    const currentDue = dueAt ?? Number.POSITIVE_INFINITY;
    return currentDue < siblingDue;
  });

  const insertIndex = targetIndex === -1 ? sorted.length : targetIndex;
  const prev = sorted[insertIndex - 1];
  const next = sorted[insertIndex];

  if (!prev && !next) {
    return LexoRank.middle().toString();
  }
  if (!prev && next) {
    return LexoRank.parse(next.rank).genPrev().toString();
  }
  if (prev && !next) {
    return LexoRank.parse(prev.rank).genNext().toString();
  }
  return LexoRank.parse(prev.rank).between(LexoRank.parse(next.rank)).toString();
};

const doc = new Y.Doc();
const yTasks = doc.getMap<Task>("tasks");
const yDevices = doc.getMap<DeviceInfo>("devices");

let idbProvider: IndexeddbPersistence | undefined;
let wsProvider: EncryptedWsProvider | null = null;
let heartbeat: number | undefined;
let initialized = false;

const STORAGE_KEYS = {
  room: "micro-step-room",
  key: "micro-step-key",
  device: "micro-step-device-id",
  deviceLabel: "micro-step-device-label",
};

const [state, setState] = createStore({
  tasks: {} as Record<string, Task>,
  devices: {} as Record<string, DeviceInfo>,
  isSynced: false,
  isOnline: false,
  roomId: "",
  secretKey: "",
  deviceLabel: "",
  deviceId: "",
});

const ensureDeviceId = () => {
  if (isServer) return "";
  let id = localStorage.getItem(STORAGE_KEYS.device);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(STORAGE_KEYS.device, id);
  }
  return id;
};

const defaultDeviceLabel = () => {
  if (isServer) return "device";
  const platform = (navigator as any).userAgentData?.platform ?? navigator.platform ?? "device";
  const hint = navigator.userAgent.split(" ").slice(0, 2).join(" ");
  return `${platform} · ${hint}`;
};

const ensureDeviceLabel = (fallback?: string) => {
  if (isServer) return "";
  const existing = localStorage.getItem(STORAGE_KEYS.deviceLabel);
  const label = existing && existing.trim().length ? existing : (fallback ?? defaultDeviceLabel());
  localStorage.setItem(STORAGE_KEYS.deviceLabel, label);
  setState("deviceLabel", label);
  return label;
};

const touchDevice = (deviceId: string, label: string) => {
  if (!deviceId || isServer) return;
  doc.transact(() => {
    yDevices.set(deviceId, { id: deviceId, label, lastSeen: Date.now() });
  });
};

const bootstrapSession = async () => {
  if (isServer) return;

  let roomId = localStorage.getItem(STORAGE_KEYS.room);
  let rawKey = localStorage.getItem(STORAGE_KEYS.key);

  if (typeof window !== "undefined" && window.location.hash.includes("room=")) {
    const params = new URLSearchParams(window.location.hash.slice(1));
    const hashRoom = params.get("room");
    const hashKey = params.get("key");
    if (hashRoom && hashKey) {
      roomId = hashRoom;
      rawKey = hashKey;
      localStorage.setItem(STORAGE_KEYS.room, hashRoom);
      localStorage.setItem(STORAGE_KEYS.key, hashKey);
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
    }
  }

  if (!roomId || !rawKey) {
    roomId = crypto.randomUUID();
    rawKey = await generateKey();
    localStorage.setItem(STORAGE_KEYS.room, roomId);
    localStorage.setItem(STORAGE_KEYS.key, rawKey);
  }

  const deviceId = ensureDeviceId();
  const deviceLabel = ensureDeviceLabel();

  setState({
    roomId,
    secretKey: rawKey,
    deviceLabel,
    deviceId,
  });

  return { roomId, rawKey, deviceId, deviceLabel };
};

const init = async () => {
  if (isServer || initialized) return;
  initialized = true;

  const session = await bootstrapSession();
  if (!session) return;

  const cryptoKey = await importKey(session.rawKey);

  idbProvider = new IndexeddbPersistence(`room-${session.roomId}`, doc);

  yTasks.observe(() => {
    setState("tasks", reconcile(yTasks.toJSON()));
  });
  yDevices.observe(() => {
    setState("devices", reconcile(yDevices.toJSON()));
  });

  idbProvider.on("synced", () => {
    setState("isSynced", true);
    // After local data is loaded, push a snapshot to seed the relay.
    wsProvider?.sendSnapshot();
  });

  wsProvider = new EncryptedWsProvider("/api/ws", session.roomId, cryptoKey, doc, {
    onStatus: payload => setState("isOnline", payload.connected),
  });

  // Announce this device once the provider is ready so it propagates.
  touchDevice(session.deviceId, session.deviceLabel);

  heartbeat = window.setInterval(() => {
    touchDevice(session.deviceId, ensureDeviceLabel(session.deviceLabel));
  }, 20000);
};

if (!isServer) {
  void init();
}

export const rawTasks = state.tasks;

export const tasks = createMemo(() => {
  const currentTasks = Object.values(state.tasks);
  const nodeMap = new Map<string, TreeNode>();

  currentTasks.forEach(t => {
    nodeMap.set(t.id, { ...t, children: [], effectiveDueDate: t.dueAt });
  });

  const roots: TreeNode[] = [];

  currentTasks.forEach(t => {
    const node = nodeMap.get(t.id)!;
    if (t.parentId && nodeMap.has(t.parentId)) {
      nodeMap.get(t.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  });

  const processNode = (node: TreeNode): number | null => {
    let minChildDate: number | null = null;

    node.children.forEach(child => {
      const childDate = processNode(child);
      if (childDate !== null) {
        if (minChildDate === null || childDate < minChildDate) {
          minChildDate = childDate;
        }
      }
    });

    if (node.dueAt !== null) {
      node.effectiveDueDate = minChildDate !== null
        ? Math.min(node.dueAt, minChildDate)
        : node.dueAt;
    } else {
      node.effectiveDueDate = minChildDate;
    }

    node.children.sort((a, b) => a.rank.localeCompare(b.rank));

    return node.effectiveDueDate;
  };

  roots.forEach(processNode);
  roots.sort((a, b) => a.rank.localeCompare(b.rank));

  return roots;
});

export const deviceList = createMemo(() => {
  return Object.values(state.devices).sort((a, b) => b.lastSeen - a.lastSeen);
});

type NewTaskPayload = {
  content: string;
  dueDate?: string | number | null;
};

export const addTask = (data: NewTaskPayload, parentId: string | null = null) => {
  const id = nanoid();
  const parsedDue = data.dueDate
    ? typeof data.dueDate === "number"
      ? data.dueDate
      : new Date(data.dueDate).getTime()
    : null;
  const dueAt = Number.isFinite(parsedDue) ? parsedDue : null;

  const rank = computeInitialRank(parentId, dueAt);

  const newTask: Task = {
    id,
    parentId,
    text: data.content,
    completed: false,
    createdAt: Date.now(),
    dueAt,
    rank,
  };

  doc.transact(() => {
    yTasks.set(id, newTask);
  });

  return newTask;
};

export const updateTask = (id: string, fields: Partial<Task>) => {
  doc.transact(() => {
    const current = yTasks.get(id);
    if (current) {
      yTasks.set(id, { ...current, ...fields });
    }
  });
};

export const moveTask = (
  taskId: string,
  newParentId: string | null,
  prevSiblingRank?: string,
  nextSiblingRank?: string
) => {
  doc.transact(() => {
    const task = yTasks.get(taskId);
    if (!task) return;

    let newRank;
    if (!prevSiblingRank && !nextSiblingRank) {
      newRank = LexoRank.middle();
    } else if (!prevSiblingRank && nextSiblingRank) {
      newRank = LexoRank.parse(nextSiblingRank).genPrev();
    } else if (prevSiblingRank && !nextSiblingRank) {
      newRank = LexoRank.parse(prevSiblingRank).genNext();
    } else {
      newRank = LexoRank.parse(prevSiblingRank!).between(LexoRank.parse(nextSiblingRank!));
    }

    yTasks.set(taskId, {
      ...task,
      parentId: newParentId,
      rank: newRank.toString(),
    });
  });
};

export const deleteTask = (id: string) => {
  doc.transact(() => {
    if (!yTasks.has(id)) return;

    const snapshot = yTasks.toJSON();
    const toRemove: string[] = [];
    const stack = [id];

    while (stack.length) {
      const currentId = stack.pop()!;
      toRemove.push(currentId);

      Object.entries(snapshot).forEach(([taskId, task]) => {
        if (task.parentId === currentId) {
          stack.push(taskId);
        }
      });
    }

    toRemove.forEach(taskId => yTasks.delete(taskId));
  });
};

export const syncState = state;

export const getDeviceId = () => state.deviceId;

export const getPairingLink = () => {
  if (typeof window === "undefined") return "";
  if (!state.roomId || !state.secretKey) return "";
  return `${window.location.origin}/#room=${state.roomId}&key=${state.secretKey}`;
};

export const rotateRoom = async () => {
  if (isServer) return;
  const newRoom = crypto.randomUUID();
  const newKey = await generateKey();
  localStorage.setItem(STORAGE_KEYS.room, newRoom);
  localStorage.setItem(STORAGE_KEYS.key, newKey);
  window.location.hash = `room=${newRoom}&key=${newKey}`;
  window.location.reload();
};

export const updateDeviceLabel = (label: string) => {
  if (isServer) return;
  const trimmed = label.trim();
  const next = trimmed.length ? trimmed : defaultDeviceLabel();
  localStorage.setItem(STORAGE_KEYS.deviceLabel, next);
  setState("deviceLabel", next);
  const deviceId = ensureDeviceId();
  touchDevice(deviceId, next);
};
