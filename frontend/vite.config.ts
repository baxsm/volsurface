import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// the browser always talks to its own origin and this forwards to the api, so
// the session cookie is first-party locally exactly as it is in production
// behind the web host's rewrite. deploying the two services apart then changes
// the rewrite target, not the app.
const apiProxy = {
  "/api": {
    target: process.env.API_PROXY_TARGET ?? "http://localhost:3007",
    changeOrigin: true,
  },
};

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: {
    port: 5173,
    proxy: apiProxy,
  },
  // the same rewrite for `vite preview`, so the built bundle can be verified
  // against the api the way it is actually served rather than only in dev
  preview: {
    port: 4173,
    proxy: apiProxy,
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    css: true,
    include: ["src/**/_tests/**/*.test.{ts,tsx}"],
  },
});
