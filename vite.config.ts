import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

import packageJson from "./package.json";

const apiProxyTarget = process.env.VITE_API_PROXY_TARGET || "http://localhost:3000";

export default defineConfig({
  clearScreen: false,
  define: {
    __APP_VERSION__: JSON.stringify(packageJson.version),
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
