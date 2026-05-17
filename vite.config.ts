import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const apiProxyTarget = process.env.VITE_API_PROXY_TARGET || "http://localhost:3000";

export default defineConfig({
  clearScreen: false,
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: false,
    proxy: {
      "/api": apiProxyTarget,
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
  },
});
