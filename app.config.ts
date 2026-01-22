import { defineConfig } from "@solidjs/start/config";

export default defineConfig({
  server: {
    experimental: {
      websocket: false
    }
  },
  vite: {
    optimizeDeps: {
      exclude: ["@vlcn.io/crsqlite-wasm"]
    },
    assetsInclude: ["**/*.wasm"]
  }
});

