import { Link, Meta, MetaProvider, Title } from "@solidjs/meta";
import { Router } from "@solidjs/router";
import { FileRoutes } from "@solidjs/start/router";
import { Show, Suspense, createSignal, onMount } from "solid-js";
import { isOnline } from "~/stores/networkStore";
import { initializeVaultStore } from "~/stores/vaultStore";
import { initializeTaskStore } from "~/stores/taskStore";
import { initializeSync } from "~/lib/sync";
import "./index.css";

export default function App() {
  const [storagePersisted, setStoragePersisted] = createSignal<boolean | null>(null);

  onMount(async () => {
    await initializeVaultStore();
    await initializeTaskStore();

    if (typeof window !== "undefined") {
      void initializeSync();

      if ("serviceWorker" in navigator) {
        navigator.serviceWorker
          .register("/sw.js", { updateViaCache: "none" })
          .then((registration) => {
            if (import.meta.env.DEV) {
              void registration.update();
            }
          })
          .catch((err) => console.warn("SW registration failed:", err));
      }

      // Request persistent storage
      if (navigator.storage?.persist) {
        const persisted = await navigator.storage.persist();
        setStoragePersisted(persisted);
        if (!persisted) {
          console.warn("Persistent storage not granted");
        }
      }
    }
  });

  return (
    <Router
      root={props => (
        <MetaProvider>
          <Title>FocusFlow</Title>
          <Link rel="preconnect" href="https://fonts.googleapis.com" />
          <Link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
          <Link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600&display=swap" rel="stylesheet" />
          <Meta name="theme-color" content="#292524" />
          <Link rel="manifest" href="/manifest.json" />
          <Show when={!isOnline()}>
            <div class="fixed top-0 left-0 right-0 bg-stone-600 text-white text-center py-2 px-4 text-sm font-semibold z-50" role="status">
              You're offline. Some features unavailable.
            </div>
          </Show>
          <Suspense>{props.children}</Suspense>
          <Show when={storagePersisted() === false}>
            <p role="status" class="text-xs text-stone-400 text-center py-2">
              ⚠ Storage may not persist across sessions
            </p>
          </Show>
        </MetaProvider>
      )}
    >
      <FileRoutes />
    </Router>
  );
}
