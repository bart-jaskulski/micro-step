// @refresh reload
import { mount, StartClient } from "@solidjs/start/client";

if (import.meta.env.PROD && "serviceWorker" in navigator) {
  navigator.serviceWorker
    .register("/sw.js", { updateViaCache: "none" })
    .catch((error) => console.warn("SW registration failed:", error));
}

mount(() => <StartClient />, document.getElementById("app")!);
