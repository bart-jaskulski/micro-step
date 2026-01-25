import { A, useLocation } from "@solidjs/router";
import { Home, Archive, RefreshCw } from "lucide-solid";
import "./BottomNav.css";

export default function BottomNav() {
  const location = useLocation();

  const isActive = (path: string) => {
    return location.pathname === path;
  };

  return (
    <nav class="bottom-nav">
      <A href="/" class="nav-item" classList={{ active: isActive("/") }}>
        <Home size={24} />
        <span>Tasks</span>
      </A>
      <A href="/logbook" class="nav-item" classList={{ active: isActive("/logbook") }}>
        <Archive size={24} />
        <span>Archive</span>
      </A>
      <A href="/pair" class="nav-item" classList={{ active: isActive("/pair") }}>
        <RefreshCw size={24} />
        <span>Sync</span>
      </A>
    </nav>
  );
}
