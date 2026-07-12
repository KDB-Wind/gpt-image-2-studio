import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

import packageJson from "./package.json";

const trustedStaticVersionManifest = JSON.parse(readFileSync(resolve("static-versions/manifest.json"), "utf8"));
const publicStaticVersionManifest = {
  latestStable: trustedStaticVersionManifest.latestStable,
  versions: trustedStaticVersionManifest.versions,
};

export default defineConfig({
  base: "./",
  clearScreen: false,
  define: {
    __APP_VERSION__: JSON.stringify(packageJson.version),
    __STATIC_BUILD__: "true",
    __STATIC_VERSION_MANIFEST__: JSON.stringify(publicStaticVersionManifest),
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
