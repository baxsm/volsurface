import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": resolve(import.meta.dirname, "./src") },
  },
  test: {
    setupFiles: ["./vitest.setup.ts"],
    // integration tests share one postgres database, so running files in
    // parallel would have them truncating each other's rows mid-assertion
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 120_000,
  },
});
