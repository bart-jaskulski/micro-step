import { createSignal } from "solid-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type VaultStateMock = {
  vaultKey: string | null;
  vaultPath: string | null;
  deviceId: string | null;
  isPaired: boolean;
  requiresRemoteBootstrap: boolean;
};

type StoreRecord = Record<string, unknown>;
type StoreDefinition = {
  keyPath: string;
  autoIncrement: boolean;
  nextKey: number;
  records: Map<unknown, StoreRecord>;
};

const textEncoder = new TextEncoder();

const makeSuccessRequest = <T>(result: T) => {
  const request = {
    result,
    error: null,
    onsuccess: null as ((event: Event) => void) | null,
    onerror: null as ((event: Event) => void) | null,
  };

  queueMicrotask(() => {
    request.onsuccess?.(new Event("success"));
  });

  return request;
};

class FakeObjectStore {
  constructor(private readonly store: StoreDefinition) {}

  put(value: StoreRecord) {
    this.store.records.set(value[this.store.keyPath], structuredClone(value));
    return makeSuccessRequest(value);
  }

  get(key: unknown) {
    return makeSuccessRequest(this.store.records.get(key));
  }

  getAll() {
    return makeSuccessRequest([...this.store.records.values()].map((value) => structuredClone(value)));
  }

  delete(key: unknown) {
    this.store.records.delete(key);
    return makeSuccessRequest(undefined);
  }

  add(value: StoreRecord) {
    const nextValue = structuredClone(value);

    if (this.store.autoIncrement) {
      nextValue[this.store.keyPath] = this.store.nextKey++;
    }

    this.store.records.set(nextValue[this.store.keyPath], nextValue);
    return makeSuccessRequest(nextValue[this.store.keyPath]);
  }
}

class FakeDatabase {
  readonly stores = new Map<string, StoreDefinition>();
  readonly objectStoreNames = {
    contains: (name: string) => this.stores.has(name),
  };

  createObjectStore(name: string, options?: { keyPath?: string; autoIncrement?: boolean }) {
    const store: StoreDefinition = {
      keyPath: options?.keyPath ?? "id",
      autoIncrement: options?.autoIncrement ?? false,
      nextKey: 1,
      records: new Map(),
    };

    this.stores.set(name, store);
    return new FakeObjectStore(store);
  }

  transaction(name: string) {
    const store = this.stores.get(name);
    if (!store) {
      throw new Error(`Missing store: ${name}`);
    }

    return {
      objectStore: () => new FakeObjectStore(store),
    };
  }
}

const installFakeIndexedDb = () => {
  const databases = new Map<string, FakeDatabase>();

  Object.defineProperty(globalThis, "indexedDB", {
    configurable: true,
    value: {
      open: (name: string) => {
        const request = {
          result: null as FakeDatabase | null,
          error: null,
          onsuccess: null as ((event: Event) => void) | null,
          onerror: null as ((event: Event) => void) | null,
          onupgradeneeded: null as ((event: IDBVersionChangeEvent) => void) | null,
        };

        queueMicrotask(() => {
          let db = databases.get(name);
          const isNew = !db;

          if (!db) {
            db = new FakeDatabase();
            databases.set(name, db);
          }

          request.result = db;

          if (isNew) {
            request.onupgradeneeded?.({ target: { result: db } } as unknown as IDBVersionChangeEvent);
          }

          request.onsuccess?.(new Event("success"));
        });

        return request;
      },
    },
  });
};

const encodeJson = (value: unknown) => textEncoder.encode(JSON.stringify(value));

describe("sync", () => {
  let vaultState: VaultStateMock;
  let resolveRemoteBootstrap: ReturnType<typeof vi.fn>;
  let execMock: ReturnType<typeof vi.fn>;
  let queryMock: ReturnType<typeof vi.fn>;
  let fetchMock: ReturnType<typeof vi.fn>;
  let setDbVersion: (value: number) => void;
  let localChanges: Array<Record<string, unknown>>;
  const workspacesCount = 0;
  const tasksCount = 0;

  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    installFakeIndexedDb();

    Object.defineProperty(window.navigator, "onLine", {
      configurable: true,
      value: true,
    });

    vaultState = {
      vaultKey: "secret",
      vaultPath: "vault-a",
      deviceId: "device-a",
      isPaired: true,
      requiresRemoteBootstrap: false,
    };

    resolveRemoteBootstrap = vi.fn(() => Promise.resolve().then(() => {
      vaultState.requiresRemoteBootstrap = false;
    }));

    execMock = vi.fn(() => Promise.resolve());
    localChanges = [];

    const [version, applyVersion] = createSignal(0);
    setDbVersion = applyVersion;

    queryMock = vi.fn((sql: string) => {
      if (sql.includes('FROM "crsql_changes"')) {
        return Promise.resolve(localChanges);
      }

      if (sql.includes("SELECT COUNT(*) as count FROM workspaces")) {
        return Promise.resolve([{ count: workspacesCount }]);
      }

      if (sql.includes("SELECT COUNT(*) as count FROM tasks")) {
        return Promise.resolve([{ count: tasksCount }]);
      }

      return Promise.resolve([]);
    });

    vi.doMock("~/stores/vaultStore", () => ({
      vaultState,
      resolveRemoteBootstrap,
    }));

    vi.doMock("~/lib/db", () => ({
      dbVersion: version,
      exec: execMock,
      query: queryMock,
    }));

    vi.doMock("~/lib/crypto", () => ({
      importKey: vi.fn(() => Promise.resolve({ type: "key" })),
      encryptData: vi.fn((_key: unknown, payload: Uint8Array) => Promise.resolve(payload)),
      decryptData: vi.fn((_key: unknown, payload: Uint8Array) => Promise.resolve(payload)),
    }));

    fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url =
        typeof input === "string"
          ? new URL(input, "http://localhost")
          : input instanceof URL
            ? input
            : new URL(input.url);

      if (url.pathname === "/api/sync/vault-a/snapshots/list") {
        return Promise.resolve(Response.json({
          snapshots: [{ key: "100-device-a.snapshot.bin", timestamp: 100 }],
        }));
      }

      if (url.pathname === "/api/sync/vault-b/snapshots/list") {
        return Promise.resolve(Response.json({ snapshots: [] }));
      }

      if (url.pathname === "/api/sync/vault-a/snapshots/download/100-device-a.snapshot.bin") {
        return Promise.resolve(new Response(encodeJson({
          workspaces: [{ id: "default", name: "Default", created_at: 1, updated_at: 1 }],
          tasks: [{ id: "task-1", parent_id: null, workspace_id: "default", text: "Imported", completed: 0, created_at: 1, updated_at: 1, due_at: null, rank: "0|aaa:" }],
        })));
      }

      if (url.pathname === "/api/sync/vault-a/list" || url.pathname === "/api/sync/vault-b/list") {
        return Promise.resolve(Response.json({ changesets: [] }));
      }

      if (url.pathname === "/api/sync/vault-a/upload" || url.pathname === "/api/sync/vault-b/upload") {
        return Promise.resolve(Response.json({ timestamp: 200 }));
      }

      if (url.pathname === "/api/sync/vault-a/snapshots/upload") {
        return Promise.resolve(Response.json({ timestamp: 111 }));
      }

      if (url.pathname === "/api/sync/vault-b/snapshots/upload") {
        return Promise.resolve(Response.json({ timestamp: 222 }));
      }

      return Promise.reject(new Error(`Unexpected fetch: ${url.toString()}`));
    });

    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("bootstraps a joined device from the latest JSON snapshot", async () => {
    vaultState.requiresRemoteBootstrap = true;

    const { initializeSync, syncStateStore } = await import("./sync");
    await initializeSync();

    expect(execMock).toHaveBeenCalledWith("DELETE FROM tasks");
    expect(execMock).toHaveBeenCalledWith(
      "INSERT INTO workspaces (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)",
      ["default", "Default", 1, 1],
    );
    expect(execMock).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO tasks"),
      ["task-1", null, "default", "Imported", 0, 1, 1, null, "0|aaa:"],
    );
    expect(syncStateStore.lastSyncTimestamp).toBe(100);
    expect(resolveRemoteBootstrap).toHaveBeenCalledTimes(1);
  });

  it("scopes metadata by vault path when switching vaults", async () => {
    vaultState.requiresRemoteBootstrap = true;
    const { initializeSync, syncStateStore } = await import("./sync");

    await initializeSync();
    expect(syncStateStore.lastSyncTimestamp).toBe(100);

    vaultState.vaultPath = "vault-b";
    vaultState.vaultKey = "secret-b";
    vaultState.requiresRemoteBootstrap = true;
    await initializeSync();

    expect(syncStateStore.lastSyncTimestamp).toBeNull();

    vaultState.vaultPath = "vault-a";
    vaultState.vaultKey = "secret";
    vaultState.requiresRemoteBootstrap = false;
    await initializeSync();

    expect(syncStateStore.lastSyncTimestamp).toBe(100);
  });

  it("uploads local crsql_changes after a debounced db change", async () => {
    vi.useFakeTimers();

    localChanges = [
      {
        table: "tasks",
        pk: "task-1",
        cid: "text",
        val: "Write docs",
        col_version: 1,
        db_version: 3,
        site_id: "site-a",
        cl: 1,
        seq: 0,
      },
    ];

    const { initializeSync, syncStateStore } = await import("./sync");
    await initializeSync();

    setDbVersion(1);
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(801);

    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining('AND ("site_id" = crsql_site_id() OR "site_id" IS NULL)'),
      [0],
    );
    expect(fetchMock).toHaveBeenCalledWith("/api/sync/vault-a/upload", expect.any(Object));
    expect(syncStateStore.lastSyncTimestamp).toBe(200);
  });
});
