import { createSignal } from "solid-js";
import { isServer } from "solid-js/web";

const [isOnline, setIsOnline] = createSignal(true);

if (!isServer) {
  setIsOnline(navigator.onLine);
  window.addEventListener("online", () => setIsOnline(true));
  window.addEventListener("offline", () => setIsOnline(false));
}

export { isOnline };
