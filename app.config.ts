import { defineConfig } from "@solidjs/start/config";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  vite: {
    plugins: [
      tailwindcss()
    ],
    optimizeDeps: {
      exclude: ["@vlcn.io/crsqlite-wasm"]
    },
    assetsInclude: ["**/*.wasm"]
  }
});

