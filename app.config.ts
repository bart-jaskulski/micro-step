import { defineConfig } from "@solidjs/start/config";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  vite: {
    plugins: [
      tailwindcss(),
      VitePWA({
        strategies: "injectManifest",
        srcDir: "src",
        filename: "sw.ts",
        injectRegister: false,
        manifest: false,
        includeAssets: ["favicon.ico", "icon-192.png", "icon-512.png", "manifest.json"],
        injectManifest: {
          globPatterns: ["**/*.{js,css,wasm}"],
          rollupFormat: "iife",
        },
        devOptions: {
          enabled: false,
        },
      }),
    ],
    optimizeDeps: {
      exclude: ["@vlcn.io/crsqlite-wasm"]
    },
    assetsInclude: ["**/*.wasm"]
  }
});
