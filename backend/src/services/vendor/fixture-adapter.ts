import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ApiError } from "@/lib/error";
import { toContract, vendorPayloadSchema } from "./parse";
import type { VendorAdapter, VendorChain } from "./types";

// the committed IBM chain. lets the whole backend run, and every test be
// deterministic, with no network and no vendor key.
const FIXTURE_DIR = join(import.meta.dirname, "..", "..", "..", "..", "fixtures");

const FIXTURES: Record<string, string> = {
  IBM: "ibm-chain-2026-07-20.json",
};

export class FixtureAdapter implements VendorAdapter {
  readonly id = "fixture";

  async fetchChain(ticker: string): Promise<VendorChain> {
    const upper = ticker.toUpperCase();
    const file = FIXTURES[upper];
    if (file === undefined) {
      throw new ApiError("NOT_FOUND", `No fixture chain for ${upper}.`);
    }

    const raw = await readFile(join(FIXTURE_DIR, file), "utf8");
    const parsed = vendorPayloadSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) {
      throw new ApiError("INTERNAL", `Fixture ${file} does not match the vendor schema.`);
    }

    const rows = parsed.data.data;
    const first = rows[0];
    if (first === undefined) {
      throw new ApiError("INTERNAL", `Fixture ${file} is empty.`);
    }

    return {
      ticker: upper,
      tradeDate: first.date,
      contracts: rows.map(toContract),
    };
  }
}
