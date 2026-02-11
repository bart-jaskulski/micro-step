import { Link, Meta, MetaProvider, Title } from "@solidjs/meta";
import { Router } from "@solidjs/router";
import { FileRoutes } from "@solidjs/start/router";
import { Suspense, onMount, onCleanup } from "solid-js";
import { initializeVaultStore } from "~/stores/vaultStore";
import { initializeTaskStore, cleanupReactiveQueries } from "~/stores/taskStore";
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

  onCleanup(() => {
    cleanupReactiveQueries();
  });

  return (
    <Router
      root={props => (
        <MetaProvider>
          <Title>FocusFlow</Title>
          <Link rel="preconnect" href="https://fonts.googleapis.com" />
          <Link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
          <Link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600&display=swap" rel="stylesheet" />
          <Suspense>{props.children}</Suspense>
        </MetaProvider>
      )}
    >
      <FileRoutes />
    </Router>
  );
}
