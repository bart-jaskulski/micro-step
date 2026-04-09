/// <reference lib="webworker" />

import { cleanupOutdatedCaches, precacheAndRoute } from "workbox-precaching";
import {
  OFFLINE_DOCUMENT_PATHS,
  shouldHandleOfflineNavigation,
  toNavigationCacheKey,
} from "~/lib/serviceWorkerRouting";

declare const self: ServiceWorkerGlobalScope;

const NAVIGATION_CACHE_NAME = "micro-step-navigation-v1";
const ROOT_DOCUMENT_PATH = "/";
const STATIC_PWA_ASSETS = ["/favicon.ico", "/icon-192.png", "/icon-512.png", "/manifest.json"].map((url) => ({
  url,
  revision: null,
}));

const toScopedDocumentUrl = (path: string) => new URL(path, self.registration.scope).toString();

const cacheOfflineDocuments = async () => {
  const cache = await caches.open(NAVIGATION_CACHE_NAME);

  await Promise.all(
    OFFLINE_DOCUMENT_PATHS.map(async (path) => {
      try {
        const url = toScopedDocumentUrl(path);
        const response = await fetch(new Request(url, { cache: "reload" }));

        if (response.ok) {
          await cache.put(url, response.clone());
        }
      } catch {
        // Keep the install alive even if one document cannot be refreshed yet.
      }
    }),
  );
};

const handleNavigation = async (request: Request) => {
  const url = new URL(request.url);
  const cache = await caches.open(NAVIGATION_CACHE_NAME);
  const cacheKey = toScopedDocumentUrl(toNavigationCacheKey(url));
  const rootFallbackKey = toScopedDocumentUrl(ROOT_DOCUMENT_PATH);

  try {
    const response = await fetch(request);

    if (response.ok && response.headers.get("content-type")?.includes("text/html")) {
      await cache.put(cacheKey, response.clone());
    }

    return response;
  } catch {
    const cachedResponse = await cache.match(cacheKey);
    if (cachedResponse) {
      return cachedResponse;
    }

    const rootFallback = await cache.match(rootFallbackKey);
    if (rootFallback) {
      return rootFallback;
    }

    return errorResponse();
  }
};

const errorResponse = () =>
  new Response("Offline content unavailable", {
    status: 503,
    statusText: "Service Unavailable",
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
    },
  });

precacheAndRoute([...self.__WB_MANIFEST, ...STATIC_PWA_ASSETS]);
cleanupOutdatedCaches();

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(cacheOfflineDocuments());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (!shouldHandleOfflineNavigation(request.mode, url, self.location.origin)) {
    return;
  }

  event.respondWith(handleNavigation(request));
});
