import { createStore, produce } from "solid-js/store";
import { getDb } from "~/lib/db";
import { importKey, encryptData, decryptData } from "~/lib/crypto";
import { vaultState } from "~/stores/vaultStore";
import { generateUploadUrl, listChangesets } from "~/actions/syncActions";

type SyncStatus = "idle" | "syncing" | "error";

const SYNC_IDB_NAME = "sync_store";
const SYNC_IDB_VERSION = 1;

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
    const db = await getDb();
    const result = await db.execO("SELECT name FROM pragma_function_list WHERE name = ?", [name]);
    return Array.isArray(result) && result.length > 0;
  } catch (err) {
    console.warn(`Failed to check for ${name}:`, err);
    return false;
  }
};

const generateChangeset = async (): Promise<Uint8Array | null> => {
  try {
    const db = await getDb();
    const hasChangeset = await hasCrsqlFunction("crsql_changeset");
    if (!hasChangeset) {
      return null;
    }
    const result = await db.execO("SELECT crsql_changeset() as changeset");
    const changeset = Array.isArray(result) ? result[0]?.changeset : result?.changeset;
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

  const { url } = await generateUploadUrl(
    vaultState.vaultPath,
    vaultState.deviceId,
    timestamp
  );

  const response = await fetch(url, {
    method: "PUT",
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
  const changesets = await listChangesets(
    vaultState.vaultPath,
    lastSync || undefined
  );

  if (changesets.length === 0) {
    console.log("No new changesets to download");
    return;
  }

  const cryptoKey = await importKey(vaultState.vaultKey);
  const db = await getDb();
  const hasApplyChangeset = await hasCrsqlFunction("crsql_apply_changeset");
  if (!hasApplyChangeset) {
    console.warn("Skipping changeset apply: crsql_apply_changeset not available");
    return;
  }

  for (const changeset of changesets) {
    try {
      const response = await fetch(changeset.url);
      if (!response.ok) {
        console.error(`Failed to download ${changeset.key}: ${response.status}`);
        continue;
      }

      const encrypted = await response.arrayBuffer();
      const decrypted = await decryptData(cryptoKey, new Uint8Array(encrypted));

      db.exec("SELECT crsql_apply_changeset(?)", [new Uint8Array(decrypted).buffer]);

      const timestamp = changeset.lastModified.getTime();
      await setSyncIDBValue("lastSyncTimestamp", timestamp);
      
      if (timestamp > (syncState.lastSyncTimestamp || 0)) {
        setSyncState("lastSyncTimestamp", timestamp);
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
      } catch (uploadErr) {
        console.error("Upload failed, queuing for retry:", uploadErr);
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

export const initializeSync = async () => {
  const lastSync = await getSyncIDBValue<number>("lastSyncTimestamp");
  if (lastSync) {
    setSyncState("lastSyncTimestamp", lastSync);
  }

  await syncNow();
};
