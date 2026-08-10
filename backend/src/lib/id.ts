import { createHash, randomUUID } from "node:crypto";

/**
 * ids are opaque text. uuid v4 rather than a sequence so a row id never leaks
 * how many rows exist or lets one be guessed from another.
 */
export const newId = (): string => randomUUID();

/** deterministic id for a row that must upsert to the same key across ingests */
export const stableId = (...parts: string[]): string =>
  createHash("sha256").update(parts.join(" ")).digest("hex").slice(0, 32);
