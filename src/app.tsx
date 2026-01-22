import { MetaProvider, Title } from "@solidjs/meta";
import { Router } from "@solidjs/router";
import { FileRoutes } from "@solidjs/start/router";
import { Suspense, onMount } from "solid-js";
import { initializeVaultStore } from "~/stores/vaultStore";
import { initializeTaskStore } from "~/stores/taskStore";
import { initializeSync } from "~/lib/sync";
import "./app.css";

export default function App() {
  onMount(async () => {
    await initializeVaultStore();
    await initializeTaskStore();
    
    if (typeof window !== "undefined") {
      initializeSync();
    }
  });

  return (
    <Router
      root={props => (
        <MetaProvider>
          <Title>SolidStart - Basic</Title>
          <Suspense>{props.children}</Suspense>
        </MetaProvider>
      )}
    >
      <FileRoutes />
    </Router>
  );
}
