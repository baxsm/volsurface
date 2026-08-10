import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

// vitest runs on node, which does not read .env the way bun does. loading it
// here keeps the tests pointed at the same local postgres and redis the app
// uses, rather than a second parallel config that can drift.
const envPath = resolve(import.meta.dirname, ".env");

if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator === -1) continue;
    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim();
    process.env[key] ??= value;
  }
}

process.env.NODE_ENV ??= "test";
