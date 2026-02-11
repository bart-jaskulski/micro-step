import { defineConfig } from "vitest/config";
import solid from "vite-plugin-solid";
import tailwindcss from '@tailwindcss/vite';

const srcPath = new URL("./src", import.meta.url).pathname;

export default defineConfig({
  plugins: [solid()],
  resolve: {
    alias: {
      "~": srcPath,
    },
    conditions: ["development", "browser"],
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: "./src/test/setup.ts",
  },
});
