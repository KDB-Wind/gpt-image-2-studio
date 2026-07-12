import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

import packageJson from "./package.json";

const apiProxyTarget = process.env.VITE_API_PROXY_TARGET || "http://localhost:3000";
const trustedStaticVersionManifest = JSON.parse(readFileSync(resolve("static-versions/manifest.json"), "utf8"));
const publicStaticVersionManifest = {
  latestStable: trustedStaticVersionManifest.latestStable,
  versions: trustedStaticVersionManifest.versions,
};

export default defineConfig({
  clearScreen: false,
  define: {
    __APP_VERSION__: JSON.stringify(packageJson.version),
    __STATIC_BUILD__: "false",
    __STATIC_VERSION_MANIFEST__: JSON.stringify(publicStaticVersionManifest),
  },
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: false,
    proxy: {
      "/api": apiProxyTarget,
    },
  },
  test: {
    exclude: ["node_modules/**", "dist/**", "dist-static/**", "tests/e2e/**"],
    environment: "jsdom",
    globals: true,
  },
});
