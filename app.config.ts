import { defineConfig } from "@solidjs/start/config";

export default defineConfig({
  server: {
    experimental: {
      websocket: true
    },
  },
  vite: {
    server: {
    allowedHosts: true
    }
  }
});
