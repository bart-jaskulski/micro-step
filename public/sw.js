const CACHE_NAME = "microstep-v1";
const IS_LOCAL_DEV =
  self.location.hostname === "localhost" ||
  self.location.hostname === "127.0.0.1" ||
  self.location.hostname === "[::1]";

const PRECACHE_URLS = ["/", "/manifest.json"];

self.addEventListener("install", (event) => {
  if (IS_LOCAL_DEV) {
    event.waitUntil(self.skipWaiting());
    return;
  }

  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  if (IS_LOCAL_DEV) {
    event.waitUntil(
      caches
        .keys()
        .then((names) => Promise.all(names.map((name) => caches.delete(name))))
        .then(() => self.clients.claim()),
    );
    return;
  }

  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(
          names
            .filter((name) => name !== CACHE_NAME)
            .map((name) => caches.delete(name)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

// --- Background Sync ---

const SYNC_IDB_NAME = "sync_store";

function openSyncDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(SYNC_IDB_NAME);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function readSyncQueue(db) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction("syncQueue", "readonly");
    const store = tx.objectStore("syncQueue");
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function removeFromQueue(db, id) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction("syncQueue", "readwrite");
    const store = tx.objectStore("syncQueue");
    const request = store.delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

async function doSync() {
  const db = await openSyncDB();
  try {
    const queue = await readSyncQueue(db);
    for (const item of queue) {
      const response = await fetch("/api/sync/upload", {
        method: "POST",
        headers: {
          "X-Vault-Path": item.vaultPath,
          "X-Device-Id": item.deviceId,
        },
        body: item.payload,
      });
      if (response.ok) {
        await removeFromQueue(db, item.id);
      }
    }
  } finally {
    db.close();
  }
}

self.addEventListener("sync", (event) => {
  if (event.tag === "sync-tasks") {
    event.waitUntil(doSync());
  }
});

self.addEventListener("fetch", (event) => {
  if (IS_LOCAL_DEV) return;

  const { request } = event;

  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Network-first for navigation (HTML)
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          return response;
        })
        .catch(() => caches.match(request)),
    );
    return;
  }

  // Cache-first for static assets (JS, CSS, WASM, fonts, images)
  const isStaticAsset =
    ["script", "style", "font", "image", "worker"].includes(
      request.destination,
    ) || url.pathname.endsWith(".wasm");

  if (isStaticAsset) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
            return response;
          }),
      ),
    );
    return;
  }
});
