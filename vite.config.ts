import { solidStart } from "@solidjs/start/config";
import { nitroV2Plugin } from "@solidjs/vite-plugin-nitro-2";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig(() => {
  return {
    plugins: [
      solidStart(),
      nitroV2Plugin(),
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
      exclude: ["@vlcn.io/crsqlite-wasm"],
    },
    assetsInclude: ["**/*.wasm"],
  };
});
