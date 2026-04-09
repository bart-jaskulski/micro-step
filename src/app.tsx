import { Link, Meta, MetaProvider, Title } from "@solidjs/meta";
import { Router } from "@solidjs/router";
import { FileRoutes } from "@solidjs/start/router";
import { Show, Suspense, onMount } from "solid-js";
import { isOnline } from "~/stores/networkStore";
import { initializeVaultStore } from "~/stores/vaultStore";
import { initializeTaskStore } from "~/stores/taskStore";
import { initializeSync } from "~/lib/sync";
import "./index.css";

export default function App() {
  onMount(async () => {
    await initializeVaultStore();
    await initializeTaskStore();

    if (typeof window !== "undefined") {
      void initializeSync();
    }
  });

  return (
    <Router
      root={props => (
        <MetaProvider>
          <Title>FocusFlow</Title>
          <Meta name="theme-color" content="#292524" />
          <Link rel="manifest" href="/manifest.json" />
          <Show when={!isOnline()}>
            <div class="fixed top-0 left-0 right-0 bg-stone-600 text-white text-center py-2 px-4 text-sm font-semibold z-50" role="status">
              You're offline. Local tasks still work. AI breakdown and sync will reconnect later.
            </div>
          </Show>
          <Suspense>{props.children}</Suspense>
        </MetaProvider>
      )}
    >
      <FileRoutes />
    </Router>
  );
}
