import { MetaProvider, Title } from "@solidjs/meta";
import { Router } from "@solidjs/router";
import { FileRoutes } from "@solidjs/start/router";
import { Suspense, onMount, onCleanup } from "solid-js";
import { initializeVaultStore } from "~/stores/vaultStore";
import { initializeTaskStore, cleanupReactiveQueries } from "~/stores/taskStore";
import { initializeSync } from "~/lib/sync";
import BottomNav from "~/components/BottomNav";
import "./app.css";

export default function App() {
  onMount(async () => {
    await initializeVaultStore();
    await initializeTaskStore();

    if (typeof window !== "undefined") {
      void initializeSync();
    }
  });

  onCleanup(() => {
    cleanupReactiveQueries();
  });

  return (
    <Router
      root={props => (
        <MetaProvider>
          <Title>SolidStart - Basic</Title>
          <Suspense>{props.children}</Suspense>
          <BottomNav />
        </MetaProvider>
      )}
    >
      <FileRoutes />
    </Router>
  );
}
