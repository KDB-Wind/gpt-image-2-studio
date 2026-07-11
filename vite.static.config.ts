import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  base: "./",
  clearScreen: false,
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
