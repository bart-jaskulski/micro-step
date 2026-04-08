import { createStore } from "solid-js/store";
import { generateVaultKey, hashVaultKeyToPath } from "~/lib/crypto";

type VaultState = {
  vaultKey: string | null;
  vaultPath: string | null;
  deviceId: string | null;
  isPaired: boolean;
  requiresRemoteBootstrap: boolean;
};

const VAULT_IDB_NAME = "vault_store";
const VAULT_IDB_VERSION = 1;
const REQUIRES_REMOTE_BOOTSTRAP_KEY = "requiresRemoteBootstrap";

let idb: IDBDatabase | null = null;

const initIndexedDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(VAULT_IDB_NAME, VAULT_IDB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains("vault")) {
        db.createObjectStore("vault", { keyPath: "key" });
      }
    };
  });
};

const setIDBValue = async (key: string, value: any) => {
  if (!idb) {
    idb = await initIndexedDB();
  }
  
  return new Promise<void>((resolve, reject) => {
    const transaction = idb!.transaction("vault", "readwrite");
    const store = transaction.objectStore("vault");
    const request = store.put({ key, value });
    
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

const getIDBValue = async <T = any>(key: string): Promise<T | null> => {
  if (!idb) {
    idb = await initIndexedDB();
  }
  
  return new Promise((resolve, reject) => {
    const transaction = idb!.transaction("vault", "readonly");
    const store = transaction.objectStore("vault");
    const request = store.get(key);
    
    request.onsuccess = () => {
      const result = request.result;
      resolve(result ? result.value : null);
    };
    request.onerror = () => reject(request.error);
  });
};

const generateDeviceId = (): string => {
  return crypto.randomUUID();
};

const [state, setState] = createStore<VaultState>({
  vaultKey: null,
  vaultPath: null,
  deviceId: null,
  isPaired: false,
  requiresRemoteBootstrap: false,
});

export const initializeVaultStore = async () => {
  const vaultKey = await getIDBValue<string>("vaultKey");
  const deviceId = await getIDBValue<string>("deviceId");
  const requiresRemoteBootstrap = await getIDBValue<boolean>(REQUIRES_REMOTE_BOOTSTRAP_KEY);
  
  if (!deviceId) {
    const newDeviceId = generateDeviceId();
    await setIDBValue("deviceId", newDeviceId);
    setState({ deviceId: newDeviceId });
  } else {
    setState({ deviceId });
  }

  if (vaultKey) {
    const vaultPath = await hashVaultKeyToPath(vaultKey);
    setState({
      vaultKey,
      vaultPath,
      isPaired: true,
      requiresRemoteBootstrap: Boolean(requiresRemoteBootstrap),
    });
  }
};

export const createVault = async () => {
  const vaultKey = await generateVaultKey();
  const vaultPath = await hashVaultKeyToPath(vaultKey);
  const deviceId = state.deviceId || generateDeviceId();

  await setIDBValue("vaultKey", vaultKey);
  await setIDBValue("deviceId", deviceId);
  await setIDBValue(REQUIRES_REMOTE_BOOTSTRAP_KEY, false);

  setState({
    vaultKey,
    vaultPath,
    deviceId,
    isPaired: true,
    requiresRemoteBootstrap: false,
  });

  return { vaultKey, vaultPath, deviceId };
};

export const joinVault = async (vaultKey: string) => {
  const vaultPath = await hashVaultKeyToPath(vaultKey);
  const deviceId = state.deviceId || generateDeviceId();

  await setIDBValue("vaultKey", vaultKey);
  await setIDBValue("deviceId", deviceId);
  await setIDBValue(REQUIRES_REMOTE_BOOTSTRAP_KEY, true);

  setState({
    vaultKey,
    vaultPath,
    deviceId,
    isPaired: true,
    requiresRemoteBootstrap: true,
  });
};

export const resolveRemoteBootstrap = async () => {
  await setIDBValue(REQUIRES_REMOTE_BOOTSTRAP_KEY, false);
  setState("requiresRemoteBootstrap", false);
};

export const clearVault = async () => {
  await setIDBValue("vaultKey", null);
  await setIDBValue(REQUIRES_REMOTE_BOOTSTRAP_KEY, false);

  setState({
    vaultKey: null,
    vaultPath: null,
    isPaired: false,
    requiresRemoteBootstrap: false,
  });
};

export const vaultState = state;
