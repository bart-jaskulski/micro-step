import { createStore, produce } from "solid-js/store";
import { exec, query, exportDb, importDb } from "~/lib/db";
import { importKey, encryptData, decryptData } from "~/lib/crypto";
import { vaultState } from "~/stores/vaultStore";

type SyncStatus = "idle" | "syncing" | "error";

const SYNC_IDB_NAME = "sync_store";
const SYNC_IDB_VERSION = 2;

let idb: IDBDatabase | null = null;

const initSyncIndexedDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(SYNC_IDB_NAME, SYNC_IDB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains("sync")) {
        db.createObjectStore("sync", { keyPath: "key" });
      }
      if (!db.objectStoreNames.contains("syncQueue")) {
        db.createObjectStore("syncQueue", { keyPath: "id", autoIncrement: true });
      }
    };
  });
};

const setSyncIDBValue = async (key: string, value: any) => {
  if (!idb) {
    idb = await initSyncIndexedDB();
  }
  
  return new Promise<void>((resolve, reject) => {
    const transaction = idb!.transaction("sync", "readwrite");
    const store = transaction.objectStore("sync");
    const request = store.put({ key, value });
    
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

const getSyncIDBValue = async <T = any>(key: string): Promise<T | null> => {
  if (!idb) {
    idb = await initSyncIndexedDB();
  }
  
  return new Promise((resolve, reject) => {
    const transaction = idb!.transaction("sync", "readonly");
    const store = transaction.objectStore("sync");
    const request = store.get(key);
    
    request.onsuccess = () => {
      const result = request.result;
      resolve(result ? result.value : null);
    };
    request.onerror = () => reject(request.error);
  });
};

type SyncQueueItem = {
  id?: number;
  vaultPath: string;
  deviceId: string;
  payload: Uint8Array;
  timestamp: number;
};

const addToSyncQueue = async (item: Omit<SyncQueueItem, "id">): Promise<void> => {
  if (!idb) idb = await initSyncIndexedDB();
  return new Promise((resolve, reject) => {
    const tx = idb!.transaction("syncQueue", "readwrite");
    const store = tx.objectStore("syncQueue");
    const request = store.add(item);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

const getSyncQueue = async (): Promise<SyncQueueItem[]> => {
  if (!idb) idb = await initSyncIndexedDB();
  return new Promise((resolve, reject) => {
    const tx = idb!.transaction("syncQueue", "readonly");
    const store = tx.objectStore("syncQueue");
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

const removeFromSyncQueue = async (id: number): Promise<void> => {
  if (!idb) idb = await initSyncIndexedDB();
  return new Promise((resolve, reject) => {
    const tx = idb!.transaction("syncQueue", "readwrite");
    const store = tx.objectStore("syncQueue");
    const request = store.delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

const registerBackgroundSync = async (): Promise<void> => {
  if (!navigator.onLine && "serviceWorker" in navigator) {
    try {
      const reg = await navigator.serviceWorker.ready;
      if ("sync" in reg) {
        await (reg as any).sync.register("sync-tasks");
      }
    } catch (err) {
      console.warn("Background sync registration failed:", err);
    }
  }
};

type SyncState = {
  status: SyncStatus;
  lastSyncTimestamp: number | null;
  offlineQueue: Array<{ changeset: Uint8Array; timestamp: number }>;
};

const [syncState, setSyncState] = createStore<SyncState>({
  status: "idle",
  lastSyncTimestamp: null,
  offlineQueue: [],
});

const hasCrsqlFunction = async (name: string): Promise<boolean> => {
  try {
    const result = await query("SELECT name FROM pragma_function_list WHERE name = ?", [name]);
    return Array.isArray(result) && result.length > 0;
  } catch (err) {
    console.warn(`Failed to check for ${name}:`, err);
    return false;
  }
};

const generateChangeset = async (): Promise<Uint8Array | null> => {
  try {
    const hasChangeset = await hasCrsqlFunction("crsql_changeset");
    if (!hasChangeset) {
      return null;
    }
    const result = await query<any>("SELECT crsql_changeset() as changeset");
    const changeset = Array.isArray(result) ? result[0]?.changeset : null;
    if (changeset) {
      return new Uint8Array(changeset);
    }
    
    return null;
  } catch (err) {
    console.error("Failed to generate changeset:", err);
    return null;
  }
};

const uploadChangeset = async (
  changeset: Uint8Array,
  timestamp: number
): Promise<void> => {
  if (!vaultState.vaultPath || !vaultState.deviceId || !vaultState.vaultKey) {
    throw new Error("Vault not configured for sync");
  }

  const cryptoKey = await importKey(vaultState.vaultKey);
  const encrypted = await encryptData(cryptoKey, changeset);

  const response = await fetch("/api/sync/upload", {
    method: "POST",
    headers: {
      "X-Vault-Path": vaultState.vaultPath,
      "X-Device-Id": vaultState.deviceId,
    },
    body: encrypted.slice(0),
  });

  if (!response.ok) {
    throw new Error(`Upload failed: ${response.status}`);
  }
};

const downloadAndApplyChangesets = async (): Promise<void> => {
  if (!vaultState.vaultPath || !vaultState.vaultKey) {
    console.warn("Cannot sync: vault not configured");
    return;
  }

  const lastSync = await getSyncIDBValue<number>("lastSyncTimestamp");

  // If no prior sync, try bootstrapping from a snapshot
  if (!lastSync) {
    try {
      const result = await downloadLatestSnapshot();
      if (result) {
        await applySnapshot(result.snapshot);
        await setSyncIDBValue("lastSyncTimestamp", result.timestamp);
        setSyncState("lastSyncTimestamp", result.timestamp);

        // Download changesets after snapshot with 1s buffer
        const afterTimestamp = result.timestamp - 1000;
        await downloadChangesetsAfter(afterTimestamp);
        return;
      }
    } catch (err) {
      console.error("Snapshot bootstrap failed, falling back to changesets:", err);
    }
  }

  await downloadChangesetsAfter(lastSync);
};

const downloadChangesetsAfter = async (after: number | null): Promise<void> => {
  if (!vaultState.vaultPath || !vaultState.vaultKey) return;

  const listUrl = new URL("/api/sync/list", window.location.origin);
  listUrl.searchParams.set("vaultPath", vaultState.vaultPath);
  if (after) {
    listUrl.searchParams.set("after", String(after));
  }

  const listResponse = await fetch(listUrl);
  if (!listResponse.ok) {
    console.error(`Failed to list changesets: ${listResponse.status}`);
    return;
  }

  const { changesets } = (await listResponse.json()) as {
    changesets: Array<{ key: string; timestamp: number }>;
  };

  if (changesets.length === 0) {
    console.log("No new changesets to download");
    return;
  }

  const cryptoKey = await importKey(vaultState.vaultKey);

  for (const changeset of changesets) {
    try {
      const response = await fetch(`/api/sync/download/${changeset.key}`);
      if (!response.ok) {
        console.error(`Failed to download ${changeset.key}: ${response.status}`);
        continue;
      }

      const encrypted = await response.arrayBuffer();
      const decrypted = await decryptData(cryptoKey, new Uint8Array(encrypted));

      await exec("SELECT crsql_apply_changeset(?)", [new Uint8Array(decrypted).buffer]);

      await setSyncIDBValue("lastSyncTimestamp", changeset.timestamp);
      
      if (changeset.timestamp > (syncState.lastSyncTimestamp || 0)) {
        setSyncState("lastSyncTimestamp", changeset.timestamp);
      }
    } catch (err) {
      console.error(`Failed to apply changeset ${changeset.key}:`, err);
    }
  }
};

export const syncNow = async (): Promise<void> => {
  if (syncState.status === "syncing") {
    return;
  }

  setSyncState("status", "syncing");

  try {
    await downloadAndApplyChangesets();

    const changeset = await generateChangeset();
    if (changeset) {
      const timestamp = Date.now();
      
      try {
        await uploadChangeset(changeset, timestamp);
        await setSyncIDBValue("lastSyncTimestamp", timestamp);
        setSyncState("lastSyncTimestamp", timestamp);
        await incrementChangesetCounter();

        // Check if we should create a snapshot after threshold
        if (await shouldCreateSnapshotByThreshold()) {
          await createAndUploadSnapshot();
        }
      } catch (uploadErr) {
        console.error("Upload failed, queuing for retry:", uploadErr);

        const cryptoKey = await importKey(vaultState.vaultKey!);
        const encrypted = await encryptData(cryptoKey, changeset);
        await addToSyncQueue({
          vaultPath: vaultState.vaultPath!,
          deviceId: vaultState.deviceId!,
          payload: encrypted,
          timestamp,
        });
        await registerBackgroundSync();

        setSyncState(
          produce((draft) => {
            draft.offlineQueue.push({ changeset, timestamp });
          })
        );
      }
    }

    if (syncState.offlineQueue.length > 0) {
      const queue = [...syncState.offlineQueue];
      
      for (const item of queue) {
        try {
          await uploadChangeset(item.changeset, item.timestamp);
          await setSyncIDBValue("lastSyncTimestamp", item.timestamp);
          await incrementChangesetCounter();
          
          setSyncState(
            produce((draft) => {
              draft.offlineQueue = draft.offlineQueue.filter(
                (q) => q.timestamp !== item.timestamp
              );
            })
          );
        } catch (err) {
          console.error(`Retry failed for timestamp ${item.timestamp}:`, err);
        }
      }
    }

    // Process persisted IDB queue (survives app restart)
    const idbQueue = await getSyncQueue();
    for (const item of idbQueue) {
      try {
        const response = await fetch("/api/sync/upload", {
          method: "POST",
          headers: {
            "X-Vault-Path": item.vaultPath,
            "X-Device-Id": item.deviceId,
          },
          body: item.payload.slice(0),
        });
        if (response.ok) {
          await removeFromSyncQueue(item.id!);
          await setSyncIDBValue("lastSyncTimestamp", item.timestamp);
          await incrementChangesetCounter();
        }
      } catch (err) {
        console.error(`IDB queue retry failed for id ${item.id}:`, err);
      }
    }
  } catch (err) {
    console.error("Sync error:", err);
    setSyncState("status", "error");
    throw err;
  } finally {
    if (syncState.status !== "error") {
      setSyncState("status", "idle");
    }
  }
};

export const syncStateStore = syncState;

// --- Snapshot Logic ---

const SNAPSHOT_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours
const SNAPSHOT_CHANGESET_THRESHOLD = 100;

const generateSnapshot = async (): Promise<Uint8Array | null> => {
  try {
    const bytes = await exportDb();
    return bytes && bytes.byteLength > 0 ? bytes : null;
  } catch (err) {
    console.error("Failed to generate snapshot:", err);
    return null;
  }
};

const uploadSnapshot = async (snapshot: Uint8Array): Promise<void> => {
  if (!vaultState.vaultPath || !vaultState.deviceId || !vaultState.vaultKey) {
    throw new Error("Vault not configured for sync");
  }

  const cryptoKey = await importKey(vaultState.vaultKey);
  const encrypted = await encryptData(cryptoKey, snapshot);

  const response = await fetch("/api/sync/snapshots/upload", {
    method: "POST",
    headers: {
      "X-Vault-Path": vaultState.vaultPath,
      "X-Device-Id": vaultState.deviceId,
    },
    body: encrypted.slice(0),
  });

  if (!response.ok) {
    throw new Error(`Snapshot upload failed: ${response.status}`);
  }
};

const shouldCreateSnapshot = async (): Promise<boolean> => {
  const lastSnapshotTimestamp = await getSyncIDBValue<number>("lastSnapshotTimestamp");
  const changesetsSinceSnapshot = await getSyncIDBValue<number>("changesetsSinceSnapshot") ?? 0;

  if (lastSnapshotTimestamp && Date.now() - lastSnapshotTimestamp < SNAPSHOT_INTERVAL_MS) {
    return false;
  }

  // Must have at least one uploaded changeset since last snapshot
  if (changesetsSinceSnapshot === 0) {
    return false;
  }

  return true;
};

const shouldCreateSnapshotByThreshold = async (): Promise<boolean> => {
  const lastSnapshotTimestamp = await getSyncIDBValue<number>("lastSnapshotTimestamp");

  if (lastSnapshotTimestamp && Date.now() - lastSnapshotTimestamp < SNAPSHOT_INTERVAL_MS) {
    return false;
  }

  const changesetsSinceSnapshot = await getSyncIDBValue<number>("changesetsSinceSnapshot") ?? 0;
  return changesetsSinceSnapshot >= SNAPSHOT_CHANGESET_THRESHOLD;
};

const createAndUploadSnapshot = async (): Promise<void> => {
  const snapshot = await generateSnapshot();
  if (!snapshot) return;

  await uploadSnapshot(snapshot);
  await setSyncIDBValue("lastSnapshotTimestamp", Date.now());
  await setSyncIDBValue("changesetsSinceSnapshot", 0);
};

export const incrementChangesetCounter = async (): Promise<void> => {
  const current = await getSyncIDBValue<number>("changesetsSinceSnapshot") ?? 0;
  await setSyncIDBValue("changesetsSinceSnapshot", current + 1);
};

const downloadLatestSnapshot = async (): Promise<{ snapshot: Uint8Array; timestamp: number } | null> => {
  if (!vaultState.vaultPath || !vaultState.vaultKey) return null;

  const listUrl = new URL("/api/sync/snapshots/list", window.location.origin);
  listUrl.searchParams.set("vaultPath", vaultState.vaultPath);

  const listResponse = await fetch(listUrl);
  if (!listResponse.ok) return null;

  const { snapshots } = (await listResponse.json()) as {
    snapshots: Array<{ key: string; timestamp: number }>;
  };

  if (snapshots.length === 0) return null;

  // Latest snapshot is last (sorted ascending by timestamp)
  const latest = snapshots[snapshots.length - 1];
  const response = await fetch(`/api/sync/snapshots/download/${latest.key}`);
  if (!response.ok) return null;

  const cryptoKey = await importKey(vaultState.vaultKey);
  const encrypted = await response.arrayBuffer();
  const decrypted = await decryptData(cryptoKey, new Uint8Array(encrypted));

  return { snapshot: new Uint8Array(decrypted), timestamp: latest.timestamp };
};

const applySnapshot = async (snapshot: Uint8Array): Promise<void> => {
  await importDb(snapshot.buffer as ArrayBuffer);
};

let wasOfflineWhileHidden = false;
let listenersInitialized = false;

const setupVisibilityListener = () => {
  document.addEventListener("visibilitychange", async () => {
    if (document.visibilityState === "hidden") {
      if (!navigator.onLine) {
        wasOfflineWhileHidden = true;
      }
      if (!vaultState.isPaired) return;
      try {
        if (await shouldCreateSnapshot()) {
          await createAndUploadSnapshot();
        }
      } catch (err) {
        console.error("Failed to create snapshot on visibility change:", err);
      }
      return;
    }

    // Becoming visible: fallback sync if was offline while hidden
    if (wasOfflineWhileHidden && navigator.onLine && vaultState.isPaired) {
      wasOfflineWhileHidden = false;
      syncNow();
    }
  });
};

const setupOnlineListener = () => {
  window.addEventListener("online", () => {
    if (vaultState.isPaired) {
      syncNow();
    }
  });
};

export const initializeSync = async () => {
  if (!vaultState.isPaired) {
    return;
  }

  const lastSync = await getSyncIDBValue<number>("lastSyncTimestamp");
  if (lastSync) {
    setSyncState("lastSyncTimestamp", lastSync);
  }

  if (!listenersInitialized) {
    setupVisibilityListener();
    setupOnlineListener();
    listenersInitialized = true;
  }

  await syncNow();
};
