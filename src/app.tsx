import { Link, Meta, MetaProvider, Title } from "@solidjs/meta";
import { Router } from "@solidjs/router";
import { FileRoutes } from "@solidjs/start/router";
import { Show, Suspense, createSignal, onMount } from "solid-js";
import { isOnline } from "~/stores/networkStore";
import { initializeVaultStore } from "~/stores/vaultStore";
import { initializeTaskStore } from "~/stores/taskStore";
import { initializeSync } from "~/lib/sync";
import "./app.css";

export default function App() {
  const [storagePersisted, setStoragePersisted] = createSignal<boolean | null>(null);

  onMount(async () => {
    await initializeVaultStore();
    await initializeTaskStore();
    
    if (typeof window !== "undefined") {
      initializeSync();

      // Register service worker
      if ("serviceWorker" in navigator) {
        navigator.serviceWorker
          .register("/sw.js")
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
          <Title>SolidStart - Basic</Title>
          <Meta name="theme-color" content="#1a9bb2" />
          <Link rel="manifest" href="/manifest.json" />
          <Show when={!isOnline()}>
            <div class="offline-banner" role="status">You're offline. Some features unavailable.</div>
          </Show>
          <Suspense>{props.children}</Suspense>
          <Show when={storagePersisted() === false}>
            <p role="status" style={{ "font-size": "0.75rem", color: "var(--muted)", "text-align": "center", "padding-block": "0.5rem" }}>
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
