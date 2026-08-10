#!/usr/bin/env bun
// backend and frontend must each be deployable on their own, so neither may
// import anything outside its own folder. this fails the build if one does.

import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const SERVICES = ["backend", "frontend"];

// any specifier that climbs out of the service root, or names a sibling service
const ESCAPES = [
  /from\s+["'](\.\.\/){2,}/,
  /import\s+["'](\.\.\/){2,}/,
  /from\s+["'][^"']*\/(engine|backend|frontend)\/src/,
  /from\s+["']@volsurface\//,
];

const collect = async (dir: string): Promise<string[]> => {
  if (!existsSync(dir)) return [];
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.name === "node_modules" || entry.name === "dist") continue;
    if (entry.isDirectory()) {
      files.push(...(await collect(full)));
      continue;
    }
    if (/\.(ts|tsx)$/.test(entry.name)) files.push(full);
  }

  return files;
};

let violations = 0;

for (const service of SERVICES) {
  const root = join(ROOT, service);
  const files = await collect(join(root, "src"));

  for (const file of files) {
    const lines = (await readFile(file, "utf8")).split("\n");
    lines.forEach((line, i) => {
      if (line.trimStart().startsWith("//")) return;
      for (const pattern of ESCAPES) {
        if (pattern.test(line)) {
          console.error(`  ${relative(ROOT, file)}:${i + 1}  ${line.trim()}`);
          violations++;
          return;
        }
      }
    });
  }
}

if (violations > 0) {
  console.error(
    `\n${violations} import(s) reach outside their service. each service must be self-contained.`,
  );
  process.exit(1);
}

console.log("service autonomy: no cross-service imports");
