import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

import packageJson from "./package.json";

export default defineConfig({
  base: "./",
  clearScreen: false,
  define: {
    __APP_VERSION__: JSON.stringify(packageJson.version),
  },
  plugins: [react()],
  build: {
    assetsInlineLimit: 10 * 1024 * 1024,
    cssCodeSplit: false,
    emptyOutDir: true,
    outDir: "dist-static",
    rollupOptions: {
      input: "index.static.html",
      output: {
        codeSplitting: false,
      },
    },
  },
  test: {
    exclude: ["node_modules/**", "dist/**", "dist-static/**", "tests/e2e/**"],
    environment: "jsdom",
    globals: true,
  },
});
