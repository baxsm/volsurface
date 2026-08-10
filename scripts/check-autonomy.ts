#!/usr/bin/env bun
// backend and frontend must each be deployable on their own, so neither may
// import anything outside its own folder. this fails the build if one does.

import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const SERVICES = ["backend", "frontend"];

// specifiers that name another workspace outright
const NAMED_ESCAPES = [/^@volsurface\//, /(^|\/)(engine|backend|frontend)\/src(\/|$)/];

const SPECIFIER = /(?:from|import)\s+["']([^"']+)["']/;

/**
 * a relative specifier escapes only if it resolves outside the service root.
 * counting "../" segments in the text cannot tell the difference: a file in
 * src/services/market/_tests legitimately needs "../../" to reach a sibling
 * module, and that stays well inside the service.
 */
const escapes = (specifier: string, fromFile: string, serviceRoot: string): boolean => {
  if (NAMED_ESCAPES.some((pattern) => pattern.test(specifier))) return true;
  if (!specifier.startsWith(".")) return false;
  const target = resolve(dirname(fromFile), specifier);
  return !target.startsWith(serviceRoot);
};

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
      const specifier = SPECIFIER.exec(line)?.[1];
      if (specifier === undefined) return;
      if (escapes(specifier, file, root)) {
        console.error(`  ${relative(ROOT, file)}:${i + 1}  ${line.trim()}`);
        violations++;
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
