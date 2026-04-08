import { createEffect, createRoot } from "solid-js";
import { createStore, produce } from "solid-js/store";
import { dbVersion, exec, query } from "~/lib/db";
import { decryptData, encryptData, importKey } from "~/lib/crypto";
import { resolveRemoteBootstrap, vaultState } from "~/stores/vaultStore";

type SyncStatus = "idle" | "syncing" | "error";

type EncodedBytes = {
  type: "bytes";
  base64: string;
};

type EncodedValue = string | number | boolean | null | EncodedBytes;

type SyncChangeRow = {
  table: string;
  pk: EncodedValue;
  cid: string;
  val: EncodedValue;
  col_version: number;
  db_version: number;
  site_id: EncodedValue;
  cl: number;
  seq: number;
};

type SyncChangesPayload = {
  changes: SyncChangeRow[];
  maxDbVersion: number;
};

type SnapshotWorkspaceRow = {
  id: string;
  name: string;
  created_at: number;
  updated_at: number;
};

type SnapshotTaskRow = {
  id: string;
  parent_id: string | null;
  workspace_id: string;
  text: string;
  completed: number;
  created_at: number;
  updated_at: number;
  due_at: number | null;
  rank: string;
};

type SyncSnapshotPayload = {
  workspaces: SnapshotWorkspaceRow[];
  tasks: SnapshotTaskRow[];
};

type SyncQueueItem = {
  id?: number;
  vaultPath: string;
  deviceId: string;
  payload: Uint8Array;
  maxDbVersion: number;
  timestamp: number;
};

type SyncState = {
  status: SyncStatus;
  lastSyncTimestamp: number | null;
  offlineQueue: Array<{ vaultPath: string; maxDbVersion: number; timestamp: number }>;
};

type DownloadResult = {
  downloadedSnapshot: boolean;
  downloadedChangesetCount: number;
};

const SYNC_IDB_NAME = "sync_store";
const SYNC_IDB_VERSION = 2;
const LAST_SYNC_TIMESTAMP_KEY = "lastSyncTimestamp";
const LAST_REMOTE_TIMESTAMP_KEY = "lastRemoteTimestamp";
const LAST_UPLOADED_DB_VERSION_KEY = "lastUploadedDbVersion";
const LAST_SNAPSHOT_TIMESTAMP_KEY = "lastSnapshotTimestamp";
const CHANGESETS_SINCE_SNAPSHOT_KEY = "changesetsSinceSnapshot";
const AUTO_SYNC_DEBOUNCE_MS = 800;
const SNAPSHOT_INTERVAL_MS = 24 * 60 * 60 * 1000;
const SNAPSHOT_CHANGESET_THRESHOLD = 100;
const DEFAULT_WORKSPACE_ID = "default";
const DEFAULT_WORKSPACE_NAME = "Default";

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

let idb: IDBDatabase | null = null;
let activeVaultPath: string | null = null;
let activeSyncPromise: Promise<void> | null = null;
let autoSyncTimer: number | null = null;
let applyingRemoteSync = false;
let dbWatcherInitialized = false;
let wasOfflineWhileHidden = false;
let listenersInitialized = false;

const [syncState, setSyncState] = createStore<SyncState>({
  status: "idle",
  lastSyncTimestamp: null,
  offlineQueue: [],
});

const bytesToBase64 = (bytes: Uint8Array) =>
  btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(""));

const buildVaultApiPath = (vaultPath: string, ...segments: string[]) =>
  `/api/sync/${encodeURIComponent(vaultPath)}/${segments.map((segment) => encodeURIComponent(segment)).join("/")}`;

const base64ToBytes = (base64: string) => {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
};

const normalizeBytes = (value: unknown): Uint8Array | null => {
  if (value instanceof Uint8Array) {
    return value;
  }

  if (value instanceof ArrayBuffer) {
    return new Uint8Array(value);
  }

  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength));
  }

  return null;
};

const encodeSqliteValue = (value: unknown): EncodedValue => {
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  const bytes = normalizeBytes(value);
  if (bytes) {
    return {
      type: "bytes",
      base64: bytesToBase64(bytes),
    };
  }

  throw new Error(`Unsupported SQLite value in sync payload: ${String(value)}`);
};

const decodeSqliteValue = (value: EncodedValue): string | number | boolean | null | Uint8Array => {
  if (typeof value === "object" && value !== null && "type" in value && value.type === "bytes") {
    return base64ToBytes(value.base64);
  }

  return value;
};

const encodeChangesPayload = (payload: SyncChangesPayload) =>
  textEncoder.encode(JSON.stringify(payload));

const decodeChangesPayload = (payload: Uint8Array): SyncChangesPayload =>
  JSON.parse(textDecoder.decode(payload)) as SyncChangesPayload;

const encodeSnapshotPayload = (payload: SyncSnapshotPayload) =>
  textEncoder.encode(JSON.stringify(payload));

const decodeSnapshotPayload = (payload: Uint8Array): SyncSnapshotPayload =>
  JSON.parse(textDecoder.decode(payload)) as SyncSnapshotPayload;

const getScopedSyncKey = (vaultPath: string, key: string) => `${vaultPath}:${key}`;

const initSyncIndexedDB = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const request = indexedDB.open(SYNC_IDB_NAME, SYNC_IDB_VERSION);

    request.onerror = () => reject(new Error(request.error?.message ?? "Failed to open sync IndexedDB"));
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

const setSyncIDBValue = async (key: string, value: unknown) => {
  if (!idb) {
    idb = await initSyncIndexedDB();
  }

  return new Promise<void>((resolve, reject) => {
    const transaction = idb!.transaction("sync", "readwrite");
    const store = transaction.objectStore("sync");
    const request = store.put({ key, value });

    request.onsuccess = () => resolve();
    request.onerror = () => reject(new Error(request.error?.message ?? `Failed to persist sync key ${key}`));
  });
};

const getSyncIDBValue = async <T,>(key: string): Promise<T | null> => {
  if (!idb) {
    idb = await initSyncIndexedDB();
  }

  return new Promise((resolve, reject) => {
    const transaction = idb!.transaction("sync", "readonly");
    const store = transaction.objectStore("sync");
    const request = store.get(key);

    request.onsuccess = () => {
      const result = request.result as { value: T } | undefined;
      resolve(result ? result.value : null);
    };
    request.onerror = () => reject(new Error(request.error?.message ?? `Failed to read sync key ${key}`));
  });
};

const setVaultSyncIDBValue = async (key: string, value: unknown, vaultPath = vaultState.vaultPath) => {
  if (!vaultPath) {
    return;
  }

  await setSyncIDBValue(getScopedSyncKey(vaultPath, key), value);
};

const getVaultSyncIDBValue = async <T,>(key: string, vaultPath = vaultState.vaultPath) => {
  if (!vaultPath) {
    return null;
  }

  return getSyncIDBValue<T>(getScopedSyncKey(vaultPath, key));
};

const addToSyncQueue = async (item: Omit<SyncQueueItem, "id">): Promise<void> => {
  if (!idb) {
    idb = await initSyncIndexedDB();
  }

  return new Promise((resolve, reject) => {
    const transaction = idb!.transaction("syncQueue", "readwrite");
    const store = transaction.objectStore("syncQueue");
    const request = store.add(item);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(new Error(request.error?.message ?? "Failed to queue sync payload"));
  });
};

const getSyncQueue = async (vaultPath?: string): Promise<SyncQueueItem[]> => {
  if (!idb) {
    idb = await initSyncIndexedDB();
  }

  return new Promise((resolve, reject) => {
    const transaction = idb!.transaction("syncQueue", "readonly");
    const store = transaction.objectStore("syncQueue");
    const request = store.getAll();

    request.onsuccess = () => {
      const items = (request.result as SyncQueueItem[]) ?? [];
      resolve(vaultPath ? items.filter((item) => item.vaultPath === vaultPath) : items);
    };
    request.onerror = () => reject(new Error(request.error?.message ?? "Failed to read sync queue"));
  });
};

const removeFromSyncQueue = async (id: number): Promise<void> => {
  if (!idb) {
    idb = await initSyncIndexedDB();
  }

  return new Promise((resolve, reject) => {
    const transaction = idb!.transaction("syncQueue", "readwrite");
    const store = transaction.objectStore("syncQueue");
    const request = store.delete(id);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(new Error(request.error?.message ?? `Failed to remove queued item ${id}`));
  });
};

const registerBackgroundSync = async (): Promise<void> => {
  if (!navigator.onLine && "serviceWorker" in navigator) {
    try {
      const registration = await navigator.serviceWorker.ready;
      const syncManager = (registration as ServiceWorkerRegistration & {
        sync?: { register: (tag: string) => Promise<void> };
      }).sync;

      if (syncManager) {
        await syncManager.register("sync-tasks");
      }
    } catch (error) {
      console.warn("Background sync registration failed:", error);
    }
  }
};

const updateVisibleLastSync = async (timestamp: number) => {
  await setVaultSyncIDBValue(LAST_SYNC_TIMESTAMP_KEY, timestamp);
  setSyncState("lastSyncTimestamp", timestamp);
};

const hydrateSyncStateForCurrentVault = async () => {
  const vaultPath = vaultState.vaultPath;

  if (vaultPath === activeVaultPath) {
    return;
  }

  activeVaultPath = vaultPath;

  if (autoSyncTimer !== null) {
    window.clearTimeout(autoSyncTimer);
    autoSyncTimer = null;
  }

  setSyncState("status", "idle");
  setSyncState("offlineQueue", []);

  if (!vaultPath) {
    setSyncState("lastSyncTimestamp", null);
    return;
  }

  const lastSyncTimestamp = await getVaultSyncIDBValue<number>(LAST_SYNC_TIMESTAMP_KEY, vaultPath);
  setSyncState("lastSyncTimestamp", lastSyncTimestamp);
};

const scheduleAutoSync = () => {
  if (!vaultState.isPaired || !navigator.onLine) {
    return;
  }

  if (autoSyncTimer !== null) {
    window.clearTimeout(autoSyncTimer);
  }

  autoSyncTimer = window.setTimeout(() => {
    autoSyncTimer = null;
    void syncNow();
  }, AUTO_SYNC_DEBOUNCE_MS);
};

const setupDbChangeWatcher = () => {
  if (dbWatcherInitialized) {
    return;
  }

  createRoot(() => {
    let lastSeenVersion = dbVersion();

    createEffect(() => {
      const version = dbVersion();

      if (version === lastSeenVersion) {
        return;
      }

      lastSeenVersion = version;

      if (applyingRemoteSync || !vaultState.isPaired) {
        return;
      }

      scheduleAutoSync();
    });
  });

  dbWatcherInitialized = true;
};

const getLocalChanges = async (): Promise<SyncChangesPayload | null> => {
  const lastUploadedDbVersion = (await getVaultSyncIDBValue<number>(LAST_UPLOADED_DB_VERSION_KEY)) ?? 0;
  const rows = await query<{
    table: string;
    pk: unknown;
    cid: string;
    val: unknown;
    col_version: number;
    db_version: number;
    site_id: unknown;
    cl: number;
    seq: number;
  }>(
    `SELECT "table", "pk", "cid", "val", "col_version", "db_version",
            COALESCE("site_id", crsql_site_id()) AS "site_id",
            "cl", "seq"
       FROM "crsql_changes"
      WHERE "db_version" > ?
        AND ("site_id" = crsql_site_id() OR "site_id" IS NULL)
      ORDER BY "db_version" ASC, "seq" ASC`,
    [lastUploadedDbVersion],
  );

  if (rows.length === 0) {
    return null;
  }

  return {
    changes: rows.map((row) => ({
      table: row.table,
      pk: encodeSqliteValue(row.pk),
      cid: row.cid,
      val: encodeSqliteValue(row.val),
      col_version: row.col_version,
      db_version: row.db_version,
      site_id: encodeSqliteValue(row.site_id),
      cl: row.cl,
      seq: row.seq,
    })),
    maxDbVersion: rows[rows.length - 1]!.db_version,
  };
};

const uploadChanges = async (payload: SyncChangesPayload): Promise<number> => {
  if (!vaultState.vaultPath || !vaultState.deviceId || !vaultState.vaultKey) {
    throw new Error("Vault not configured for sync");
  }

  const cryptoKey = await importKey(vaultState.vaultKey);
  const encrypted = await encryptData(cryptoKey, encodeChangesPayload(payload));
  const response = await fetch(buildVaultApiPath(vaultState.vaultPath, "upload"), {
    method: "POST",
    headers: {
      "X-Device-Id": vaultState.deviceId,
    },
    body: encrypted.slice(0),
  });

  if (!response.ok) {
    throw new Error(`Upload failed: ${response.status}`);
  }

  const result = (await response.json()) as { timestamp: number };
  return result.timestamp;
};

const applyChanges = async (changes: SyncChangeRow[]) => {
  if (changes.length === 0) {
    return;
  }

  applyingRemoteSync = true;

  try {
    await exec("BEGIN");

    for (const change of changes) {
      await exec(
        `INSERT INTO "crsql_changes"
           ("table", "pk", "cid", "val", "col_version", "db_version", "site_id", "cl", "seq")
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          change.table,
          decodeSqliteValue(change.pk),
          change.cid,
          decodeSqliteValue(change.val),
          change.col_version,
          change.db_version,
          decodeSqliteValue(change.site_id),
          change.cl,
          change.seq,
        ],
      );
    }

    await exec("COMMIT");
  } catch (error) {
    try {
      await exec("ROLLBACK");
    } catch {
      // Nothing useful to do here.
    }
    throw error;
  } finally {
    applyingRemoteSync = false;
  }
};

const downloadAndApplyChangesAfter = async (afterTimestamp: number | null): Promise<number> => {
  if (!vaultState.vaultPath || !vaultState.vaultKey) {
    return 0;
  }

  const listUrl = new URL(buildVaultApiPath(vaultState.vaultPath, "list"), window.location.origin);

  if (afterTimestamp !== null) {
    listUrl.searchParams.set("after", String(afterTimestamp));
  }

  const response = await fetch(listUrl);
  if (!response.ok) {
    throw new Error(`Failed to list changesets: ${response.status}`);
  }

  const { changesets } = (await response.json()) as {
    changesets: Array<{ key: string; timestamp: number }>;
  };

  if (changesets.length === 0) {
    return 0;
  }

  const cryptoKey = await importKey(vaultState.vaultKey);
  let appliedCount = 0;

  for (const changeset of changesets) {
    const downloadResponse = await fetch(buildVaultApiPath(vaultState.vaultPath, "download", changeset.key));
    if (!downloadResponse.ok) {
      throw new Error(`Failed to download ${changeset.key}: ${downloadResponse.status}`);
    }

    const encrypted = new Uint8Array(await downloadResponse.arrayBuffer());
    const decrypted = await decryptData(cryptoKey, encrypted);
    const payload = decodeChangesPayload(decrypted);

    await applyChanges(payload.changes);
    await setVaultSyncIDBValue(LAST_REMOTE_TIMESTAMP_KEY, changeset.timestamp);
    await updateVisibleLastSync(changeset.timestamp);
    appliedCount += payload.changes.length;
  }

  return appliedCount;
};

const hasSyncableData = async () => {
  const workspaces = await query<{ count: number }>(
    "SELECT COUNT(*) as count FROM workspaces WHERE id != ?",
    [DEFAULT_WORKSPACE_ID],
  );
  const tasks = await query<{ count: number }>("SELECT COUNT(*) as count FROM tasks");

  return (workspaces[0]?.count ?? 0) > 0 || (tasks[0]?.count ?? 0) > 0;
};

const generateSnapshot = async (): Promise<Uint8Array | null> => {
  const workspaces = await query<SnapshotWorkspaceRow>(
    "SELECT id, name, created_at, updated_at FROM workspaces ORDER BY created_at ASC",
  );
  const tasks = await query<SnapshotTaskRow>(
    `SELECT id, parent_id, workspace_id, text, completed, created_at, updated_at, due_at, rank
       FROM tasks
      ORDER BY created_at ASC`,
  );

  if (workspaces.length === 0 && tasks.length === 0) {
    return null;
  }

  return encodeSnapshotPayload({ workspaces, tasks });
};

const uploadSnapshot = async (snapshot: Uint8Array): Promise<number> => {
  if (!vaultState.vaultPath || !vaultState.deviceId || !vaultState.vaultKey) {
    throw new Error("Vault not configured for sync");
  }

  const cryptoKey = await importKey(vaultState.vaultKey);
  const encrypted = await encryptData(cryptoKey, snapshot);
  const response = await fetch(buildVaultApiPath(vaultState.vaultPath, "snapshots", "upload"), {
    method: "POST",
    headers: {
      "X-Device-Id": vaultState.deviceId,
    },
    body: encrypted.slice(0),
  });

  if (!response.ok) {
    throw new Error(`Snapshot upload failed: ${response.status}`);
  }

  const result = (await response.json()) as { timestamp: number };
  return result.timestamp;
};

const createAndUploadSnapshot = async (): Promise<number | null> => {
  const snapshot = await generateSnapshot();
  if (!snapshot) {
    return null;
  }

  const timestamp = await uploadSnapshot(snapshot);
  await setVaultSyncIDBValue(LAST_SNAPSHOT_TIMESTAMP_KEY, timestamp);
  await setVaultSyncIDBValue(CHANGESETS_SINCE_SNAPSHOT_KEY, 0);
  await updateVisibleLastSync(timestamp);

  return timestamp;
};

const shouldCreateSnapshot = async (): Promise<boolean> => {
  const lastSnapshotTimestamp = await getVaultSyncIDBValue<number>(LAST_SNAPSHOT_TIMESTAMP_KEY);
  const changesetsSinceSnapshot = (await getVaultSyncIDBValue<number>(CHANGESETS_SINCE_SNAPSHOT_KEY)) ?? 0;

  if (!changesetsSinceSnapshot) {
    return false;
  }

  if (lastSnapshotTimestamp && Date.now() - lastSnapshotTimestamp < SNAPSHOT_INTERVAL_MS) {
    return false;
  }

  return true;
};

const shouldCreateSnapshotByThreshold = async (): Promise<boolean> => {
  const lastSnapshotTimestamp = await getVaultSyncIDBValue<number>(LAST_SNAPSHOT_TIMESTAMP_KEY);
  const changesetsSinceSnapshot = (await getVaultSyncIDBValue<number>(CHANGESETS_SINCE_SNAPSHOT_KEY)) ?? 0;

  if (lastSnapshotTimestamp && Date.now() - lastSnapshotTimestamp < SNAPSHOT_INTERVAL_MS) {
    return false;
  }

  return changesetsSinceSnapshot >= SNAPSHOT_CHANGESET_THRESHOLD;
};

export const incrementChangesetCounter = async (): Promise<void> => {
  const current = (await getVaultSyncIDBValue<number>(CHANGESETS_SINCE_SNAPSHOT_KEY)) ?? 0;
  await setVaultSyncIDBValue(CHANGESETS_SINCE_SNAPSHOT_KEY, current + 1);
};

const resetLocalStateForRemoteVault = async () => {
  applyingRemoteSync = true;

  try {
    await exec("BEGIN");
    await exec("DELETE FROM tasks");
    await exec("DELETE FROM workspaces");
    await exec(
      "INSERT INTO workspaces (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)",
      [DEFAULT_WORKSPACE_ID, DEFAULT_WORKSPACE_NAME, Date.now(), Date.now()],
    );
    await exec("COMMIT");
  } catch (error) {
    try {
      await exec("ROLLBACK");
    } catch {
      // Nothing useful to do here.
    }
    throw error;
  } finally {
    applyingRemoteSync = false;
  }
};

const downloadLatestSnapshot = async (): Promise<{ snapshot: SyncSnapshotPayload; timestamp: number } | null> => {
  if (!vaultState.vaultPath || !vaultState.vaultKey) {
    return null;
  }

  const listUrl = new URL(buildVaultApiPath(vaultState.vaultPath, "snapshots", "list"), window.location.origin);

  const listResponse = await fetch(listUrl);
  if (!listResponse.ok) {
    throw new Error(`Failed to list snapshots: ${listResponse.status}`);
  }

  const { snapshots } = (await listResponse.json()) as {
    snapshots: Array<{ key: string; timestamp: number }>;
  };

  if (snapshots.length === 0) {
    return null;
  }

  const latestSnapshot = snapshots[snapshots.length - 1]!;
  const downloadResponse = await fetch(
    buildVaultApiPath(vaultState.vaultPath, "snapshots", "download", latestSnapshot.key),
  );
  if (!downloadResponse.ok) {
    throw new Error(`Failed to download snapshot ${latestSnapshot.key}: ${downloadResponse.status}`);
  }

  const cryptoKey = await importKey(vaultState.vaultKey);
  const encrypted = new Uint8Array(await downloadResponse.arrayBuffer());
  const decrypted = await decryptData(cryptoKey, encrypted);

  return {
    snapshot: decodeSnapshotPayload(decrypted),
    timestamp: latestSnapshot.timestamp,
  };
};

const applySnapshot = async (snapshot: SyncSnapshotPayload) => {
  applyingRemoteSync = true;

  try {
    await exec("BEGIN");
    await exec("DELETE FROM tasks");
    await exec("DELETE FROM workspaces");

    for (const workspace of snapshot.workspaces) {
      await exec(
        "INSERT INTO workspaces (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)",
        [workspace.id, workspace.name, workspace.created_at, workspace.updated_at],
      );
    }

    for (const task of snapshot.tasks) {
      await exec(
        `INSERT INTO tasks
           (id, parent_id, workspace_id, text, completed, created_at, updated_at, due_at, rank)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          task.id,
          task.parent_id,
          task.workspace_id,
          task.text,
          task.completed,
          task.created_at,
          task.updated_at,
          task.due_at,
          task.rank,
        ],
      );
    }

    await exec("COMMIT");
  } catch (error) {
    try {
      await exec("ROLLBACK");
    } catch {
      // Nothing useful to do here.
    }
    throw error;
  } finally {
    applyingRemoteSync = false;
  }
};

const bootstrapRemoteState = async (): Promise<DownloadResult> => {
  if (!vaultState.requiresRemoteBootstrap) {
    const lastRemoteTimestamp = await getVaultSyncIDBValue<number>(LAST_REMOTE_TIMESTAMP_KEY);
    const downloadedChangesetCount = await downloadAndApplyChangesAfter(lastRemoteTimestamp);

    return {
      downloadedSnapshot: false,
      downloadedChangesetCount,
    };
  }

  await resetLocalStateForRemoteVault();

  const snapshotResult = await downloadLatestSnapshot();
  if (snapshotResult) {
    await applySnapshot(snapshotResult.snapshot);
    await setVaultSyncIDBValue(LAST_REMOTE_TIMESTAMP_KEY, snapshotResult.timestamp);
    await setVaultSyncIDBValue(LAST_SNAPSHOT_TIMESTAMP_KEY, snapshotResult.timestamp);
    await setVaultSyncIDBValue(CHANGESETS_SINCE_SNAPSHOT_KEY, 0);
    await updateVisibleLastSync(snapshotResult.timestamp);

    const downloadedChangesetCount = await downloadAndApplyChangesAfter(snapshotResult.timestamp - 1);
    return {
      downloadedSnapshot: true,
      downloadedChangesetCount,
    };
  }

  const downloadedChangesetCount = await downloadAndApplyChangesAfter(null);
  return {
    downloadedSnapshot: false,
    downloadedChangesetCount,
  };
};

const flushPersistedQueue = async () => {
  if (!vaultState.vaultPath) {
    return;
  }

  const queuedItems = await getSyncQueue(vaultState.vaultPath);
  for (const item of queuedItems) {
    try {
      const response = await fetch(buildVaultApiPath(item.vaultPath, "upload"), {
        method: "POST",
        headers: {
          "X-Device-Id": item.deviceId,
        },
        body: item.payload.slice(0),
      });

      if (!response.ok) {
        continue;
      }

      const result = (await response.json()) as { timestamp: number };
      await removeFromSyncQueue(item.id!);
      await setVaultSyncIDBValue(LAST_UPLOADED_DB_VERSION_KEY, item.maxDbVersion, item.vaultPath);
      await updateVisibleLastSync(result.timestamp);
      await incrementChangesetCounter();

      setSyncState(
        produce((draft) => {
          draft.offlineQueue = draft.offlineQueue.filter(
            (queued) => !(queued.vaultPath === item.vaultPath && queued.timestamp === item.timestamp),
          );
        }),
      );
    } catch (error) {
      console.error(`Queued upload retry failed for ${item.id}:`, error);
    }
  }
};

export const syncNow = async (): Promise<void> => {
  if (activeSyncPromise) {
    return activeSyncPromise;
  }

  activeSyncPromise = (async () => {
    if (!vaultState.isPaired || !vaultState.vaultPath || !vaultState.vaultKey || !vaultState.deviceId) {
      return;
    }

    await hydrateSyncStateForCurrentVault();
    setSyncState("status", "syncing");
    let syncFailed = false;

    try {
      const downloadResult = await bootstrapRemoteState();
      const existingSnapshotTimestamp = await getVaultSyncIDBValue<number>(LAST_SNAPSHOT_TIMESTAMP_KEY);
      const shouldUploadBootstrapSnapshot =
        existingSnapshotTimestamp === null
        && (
          !vaultState.requiresRemoteBootstrap
          || downloadResult.downloadedSnapshot
          || downloadResult.downloadedChangesetCount > 0
          || await hasSyncableData()
        );

      const localChanges = await getLocalChanges();
      if (localChanges) {
        try {
          const timestamp = await uploadChanges(localChanges);
          await setVaultSyncIDBValue(LAST_UPLOADED_DB_VERSION_KEY, localChanges.maxDbVersion);
          await updateVisibleLastSync(timestamp);
          await incrementChangesetCounter();

          if (await shouldCreateSnapshotByThreshold()) {
            await createAndUploadSnapshot();
          }
        } catch (error) {
          console.error("Upload failed, queuing for retry:", error);

          const cryptoKey = await importKey(vaultState.vaultKey);
          const encrypted = await encryptData(cryptoKey, encodeChangesPayload(localChanges));
          const queuedAt = Date.now();

          await addToSyncQueue({
            vaultPath: vaultState.vaultPath,
            deviceId: vaultState.deviceId,
            payload: encrypted,
            maxDbVersion: localChanges.maxDbVersion,
            timestamp: queuedAt,
          });
          await registerBackgroundSync();

          setSyncState(
            produce((draft) => {
              draft.offlineQueue.push({
                vaultPath: vaultState.vaultPath!,
                maxDbVersion: localChanges.maxDbVersion,
                timestamp: queuedAt,
              });
            }),
          );
        }
      }

      if (shouldUploadBootstrapSnapshot) {
        await createAndUploadSnapshot();
      }

      await flushPersistedQueue();

      if (vaultState.requiresRemoteBootstrap) {
        await resolveRemoteBootstrap();
      }
    } catch (error) {
      syncFailed = true;
      console.error("Sync error:", error);
      setSyncState("status", "error");
      throw error;
    } finally {
      if (!syncFailed) {
        setSyncState("status", "idle");
      }
    }
  })();

  try {
    await activeSyncPromise;
  } finally {
    activeSyncPromise = null;
  }
};

export const syncStateStore = syncState;

const setupVisibilityListener = () => {
  document.addEventListener("visibilitychange", async () => {
    if (document.visibilityState === "hidden") {
      if (!navigator.onLine) {
        wasOfflineWhileHidden = true;
      }

      if (!vaultState.isPaired) {
        return;
      }

      try {
        if (await shouldCreateSnapshot()) {
          await createAndUploadSnapshot();
        }
      } catch (error) {
        console.error("Failed to create snapshot on visibility change:", error);
      }

      return;
    }

    if (wasOfflineWhileHidden && navigator.onLine && vaultState.isPaired) {
      wasOfflineWhileHidden = false;
      void syncNow();
    }
  });
};

const setupOnlineListener = () => {
  window.addEventListener("online", () => {
    if (vaultState.isPaired) {
      void syncNow();
    }
  });
};

export const initializeSync = async () => {
  if (!vaultState.isPaired) {
    return;
  }

  if (!listenersInitialized) {
    setupDbChangeWatcher();
    setupVisibilityListener();
    setupOnlineListener();
    listenersInitialized = true;
  }

  await hydrateSyncStateForCurrentVault();
  await syncNow();
};
