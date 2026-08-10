import { describe, expect, it } from "vitest";
import type { OptionType } from "../../types";
import { blackScholesPrice } from "../black-scholes";
import { impliedVol, MAX_VOL, MIN_VOL } from "../implied-vol";

describe("impliedVol - round trip", () => {
  it("recovers the input vol for the golden case", () => {
    const price = blackScholesPrice({ type: "call", S: 100, K: 100, r: 0.05, sigma: 0.2, T: 1 });
    const result = impliedVol({ type: "call", S: 100, K: 100, r: 0.05, T: 1, price });
    expect(result.converged).toBe(true);
    expect(result.iv).toBeCloseTo(0.2, 8);
  });

  it("round-trips across a wide grid of strikes, vols, and expiries", () => {
    let checked = 0;
    for (const type of ["call", "put"] as OptionType[]) {
      for (const K of [60, 80, 100, 120, 150]) {
        for (const sigma of [0.08, 0.2, 0.45, 0.9, 1.8]) {
          for (const T of [0.05, 0.25, 1, 3]) {
            const inputs = { type, S: 100, K, r: 0.04, T, q: 0.01 };
            const price = blackScholesPrice({ ...inputs, sigma });
            // skip quotes that round to zero value - no vol is recoverable there
            if (price < 1e-8) continue;

            const result = impliedVol({ ...inputs, price });
            expect(result.converged).toBe(true);
            expect(result.iv).not.toBeNull();
            // verify by REPRICING, not by comparing vols: in the flat wings many
            // vols map to the same price, so price agreement is the real invariant
            const reprice = blackScholesPrice({ ...inputs, sigma: result.iv! });
            expect(Math.abs(reprice - price)).toBeLessThan(1e-6);
            checked++;
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(150);
  });

  it("recovers vol for both calls and puts at the same strike", () => {
    for (const type of ["call", "put"] as OptionType[]) {
      const inputs = { type, S: 100, K: 105, r: 0.03, T: 0.5 };
      const price = blackScholesPrice({ ...inputs, sigma: 0.33 });
      const result = impliedVol({ ...inputs, price });
      expect(result.iv).toBeCloseTo(0.33, 6);
    }
  });

  it("handles a dividend yield", () => {
    const inputs = { type: "call" as const, S: 100, K: 100, r: 0.05, T: 1, q: 0.06 };
    const price = blackScholesPrice({ ...inputs, sigma: 0.28 });
    const result = impliedVol({ ...inputs, price });
    expect(result.iv).toBeCloseTo(0.28, 6);
  });

  it("reports newton for well-behaved ATM quotes", () => {
    const price = blackScholesPrice({ type: "call", S: 100, K: 100, r: 0.05, sigma: 0.25, T: 1 });
    const result = impliedVol({ type: "call", S: 100, K: 100, r: 0.05, T: 1, price });
    expect(result.method).toBe("newton");
    expect(result.iterations).toBeLessThan(20);
  });
});

describe("impliedVol - low vega fallback", () => {
  it("solves deep OTM quotes where vega is near zero", () => {
    // deep OTM short-dated: vega collapses, newton stalls, brent must catch it
    const inputs = { type: "call" as const, S: 100, K: 200, r: 0.05, T: 0.02 };
    const price = blackScholesPrice({ ...inputs, sigma: 0.6 });
    const result = impliedVol({ ...inputs, price });
    expect(result.converged).toBe(true);
    const reprice = blackScholesPrice({ ...inputs, sigma: result.iv! });
    expect(Math.abs(reprice - price)).toBeLessThan(1e-8);
  });

  it("solves deep ITM quotes where vega is near zero", () => {
    const inputs = { type: "call" as const, S: 200, K: 100, r: 0.05, T: 0.02 };
    const price = blackScholesPrice({ ...inputs, sigma: 0.6 });
    const result = impliedVol({ ...inputs, price });
    expect(result.converged).toBe(true);
    const reprice = blackScholesPrice({ ...inputs, sigma: result.iv! });
    expect(Math.abs(reprice - price)).toBeLessThan(1e-8);
  });

  it("exercises the brent branch and still reprices correctly", () => {
    // sweep hard cases and assert brent is genuinely used somewhere
    const methods = new Set<string>();
    for (const K of [40, 60, 180, 250]) {
      for (const T of [0.01, 0.05]) {
        for (const sigma of [0.15, 1.2]) {
          const inputs = { type: "call" as const, S: 100, K, r: 0.05, T };
          const price = blackScholesPrice({ ...inputs, sigma });
          if (price < 1e-10) continue;
          const result = impliedVol({ ...inputs, price });
          methods.add(result.method);
          if (result.iv !== null) {
            const reprice = blackScholesPrice({ ...inputs, sigma: result.iv });
            expect(Math.abs(reprice - price)).toBeLessThan(1e-6);
          }
        }
      }
    }
    expect(methods.size).toBeGreaterThan(1);
  });
});

describe("impliedVol - no-solution guards", () => {
  it("rejects a price below intrinsic", () => {
    // call intrinsic here is ~100-95e^-0.05 ~= 9.63; quote well under that
    const result = impliedVol({ type: "call", S: 100, K: 95, r: 0.05, T: 1, price: 1 });
    expect(result.iv).toBeNull();
    expect(result.converged).toBe(false);
    expect(result.method).toBe("bounds");
    expect(result.reason).toBe("price below intrinsic");
  });

  it("rejects a price above the no-arbitrage cap", () => {
    // a call can never be worth more than the discounted forward
    const result = impliedVol({ type: "call", S: 100, K: 95, r: 0.05, T: 1, price: 150 });
    expect(result.iv).toBeNull();
    expect(result.reason).toBe("price above no-arbitrage cap");
  });

  it("rejects a put priced above its discounted strike", () => {
    const result = impliedVol({ type: "put", S: 100, K: 100, r: 0.05, T: 1, price: 99 });
    expect(result.iv).toBeNull();
    expect(result.reason).toBe("price above no-arbitrage cap");
  });

  it("rejects non-positive prices", () => {
    for (const price of [0, -5]) {
      const result = impliedVol({ type: "call", S: 100, K: 100, r: 0.05, T: 1, price });
      expect(result.iv).toBeNull();
      expect(result.reason).toBe("non-positive price");
    }
  });

  it("rejects expired options", () => {
    const result = impliedVol({ type: "call", S: 100, K: 100, r: 0.05, T: 0, price: 5 });
    expect(result.iv).toBeNull();
    expect(result.reason).toBe("expired");
  });

  it("never returns a number outside the clamp range", () => {
    for (const price of [0.0001, 5, 50, 95]) {
      const result = impliedVol({ type: "call", S: 100, K: 100, r: 0.05, T: 1, price });
      if (result.iv !== null) {
        expect(result.iv).toBeGreaterThanOrEqual(MIN_VOL);
        expect(result.iv).toBeLessThanOrEqual(MAX_VOL);
      }
    }
  });

  it("clamps at the bounds rather than diverging", () => {
    const atIntrinsic = impliedVol({
      type: "call",
      S: 100,
      K: 95,
      r: 0.05,
      T: 1,
      price: 100 - 95 * Math.exp(-0.05),
    });
    expect(atIntrinsic.iv).toBe(MIN_VOL);
    expect(atIntrinsic.method).toBe("bounds");

    const atCap = impliedVol({ type: "call", S: 100, K: 95, r: 0.05, T: 1, price: 100 });
    expect(atCap.iv).toBe(MAX_VOL);
  });
});
