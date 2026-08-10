import { env } from "@/env";
import { AlphaVantageAdapter } from "./alpha-vantage-adapter";
import { FixtureAdapter } from "./fixture-adapter";
import type { VendorAdapter } from "./types";

let adapter: VendorAdapter | null = null;

/**
 * lazy so importing this never constructs an adapter that reads the vendor key
 * at module load. MARKET_DATA_SOURCE decides which one; fixture is the default
 * and the only path currently verifiable without a paid vendor plan.
 */
export const vendorAdapter = (): VendorAdapter => {
  if (adapter === null) {
    adapter =
      env.MARKET_DATA_SOURCE === "alphavantage" ? new AlphaVantageAdapter() : new FixtureAdapter();
  }
  return adapter;
};

export { AlphaVantageAdapter } from "./alpha-vantage-adapter";
export { FixtureAdapter } from "./fixture-adapter";
export type { VendorAdapter, VendorChain, VendorContract } from "./types";
