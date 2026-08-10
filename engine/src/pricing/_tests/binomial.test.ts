import { describe, expect, it } from "vitest";
import type { OptionInputs } from "../../types";
import { americanPrice, binomialPrice, DEFAULT_STEPS, MAX_STEPS } from "../binomial";
import { blackScholesPrice } from "../black-scholes";

const euroCall: OptionInputs = { type: "call", S: 100, K: 100, r: 0.05, sigma: 0.2, T: 1, q: 0 };

describe("binomialPrice - european convergence", () => {
  it("converges to black-scholes as steps grow", () => {
    const exact = blackScholesPrice(euroCall);
    const errAt = (steps: number) =>
      Math.abs(binomialPrice(euroCall, { steps, style: "european", averageSteps: false }) - exact);

    // CRR error is O(1/N): each 10x in steps should cut error ~10x
    expect(errAt(100)).toBeLessThan(errAt(10));
    expect(errAt(1000)).toBeLessThan(errAt(100));
    expect(errAt(1000)).toBeLessThan(0.005);
    expect(errAt(2000)).toBeLessThan(0.002);
  });

  it("N/N+1 averaging beats the raw tree at the same step count", () => {
    const exact = blackScholesPrice(euroCall);
    for (const steps of [50, 100, 256]) {
      const raw = Math.abs(
        binomialPrice(euroCall, { steps, style: "european", averageSteps: false }) - exact,
      );
      const avg = Math.abs(
        binomialPrice(euroCall, { steps, style: "european", averageSteps: true }) - exact,
      );
      expect(avg).toBeLessThan(raw);
    }
    // measured ~16x better at n=100
    expect(
      Math.abs(binomialPrice(euroCall, { steps: 100, style: "european" }) - exact),
    ).toBeLessThan(0.002);
  });

  it("control variate removes european tree error exactly", () => {
    // by construction: correcting by (bs - tree_euro) on a european IS bs
    const exact = blackScholesPrice(euroCall);
    const cv = binomialPrice(euroCall, {
      steps: 25,
      style: "european",
      averageSteps: false,
      controlVariate: true,
    });
    expect(cv).toBeCloseTo(exact, 12);
  });

  it("matches black-scholes for puts too", () => {
    const euroPut: OptionInputs = { ...euroCall, type: "put" };
    const priced = binomialPrice(euroPut, { steps: 2000, style: "european" });
    expect(priced).toBeCloseTo(blackScholesPrice(euroPut), 3);
  });

  it("handles a dividend yield", () => {
    const withDiv: OptionInputs = { ...euroCall, q: 0.04 };
    expect(binomialPrice(withDiv, { steps: 2000, style: "european" })).toBeCloseTo(
      blackScholesPrice(withDiv),
      3,
    );
  });
});

describe("binomialPrice - american early exercise", () => {
  // Hull, Options Futures and Other Derivatives, ch.13 worked example.
  // the printed 2-step decimal is edition-dependent and is NOT asserted here;
  // the converged value and the early-exercise premium are the real invariants.
  const americanPut: OptionInputs = { type: "put", S: 50, K: 52, r: 0.05, sigma: 0.3, T: 2, q: 0 };

  it("converges to a stable american put value", () => {
    const converged = binomialPrice(americanPut, { steps: 2000 });
    expect(converged).toBeCloseTo(7.4723, 2);

    // successive refinements should stay tight to the converged value
    expect(binomialPrice(americanPut, { steps: 500 })).toBeCloseTo(converged, 2);
    expect(binomialPrice(americanPut, { steps: 1000 })).toBeCloseTo(converged, 2);
  });

  it("prices an early-exercise premium over the european put", () => {
    const american = binomialPrice(americanPut, { steps: 1000, style: "american" });
    const european = blackScholesPrice(americanPut);
    expect(american).toBeGreaterThan(european);
    expect(american - european).toBeGreaterThan(0.5);
  });

  it("american is never worth less than european, across a grid", () => {
    for (const S of [70, 85, 100, 115, 130]) {
      for (const sigma of [0.15, 0.35, 0.6]) {
        for (const type of ["call", "put"] as const) {
          const inputs: OptionInputs = { type, S, K: 100, r: 0.05, sigma, T: 1, q: 0 };
          const american = binomialPrice(inputs, { steps: 200, style: "american" });
          const european = binomialPrice(inputs, { steps: 200, style: "european" });
          expect(american).toBeGreaterThanOrEqual(european - 1e-9);
        }
      }
    }
  });

  it("american call on a non-dividend payer matches european", () => {
    // classic result: never optimal to exercise early without dividends
    const call: OptionInputs = { type: "call", S: 100, K: 95, r: 0.05, sigma: 0.25, T: 1, q: 0 };
    const american = binomialPrice(call, { steps: 500, style: "american" });
    expect(american).toBeCloseTo(blackScholesPrice(call), 2);
  });

  it("american call gains early-exercise value once dividends are large", () => {
    const call: OptionInputs = { type: "call", S: 100, K: 95, r: 0.02, sigma: 0.25, T: 1, q: 0.12 };
    const american = binomialPrice(call, { steps: 500, style: "american" });
    expect(american).toBeGreaterThan(blackScholesPrice(call) + 0.05);
  });

  it("never prices below intrinsic", () => {
    for (const S of [60, 80, 100, 120, 140]) {
      const put = binomialPrice(
        { type: "put", S, K: 100, r: 0.05, sigma: 0.2, T: 1 },
        { steps: 200 },
      );
      expect(put).toBeGreaterThanOrEqual(Math.max(100 - S, 0) - 1e-9);
    }
  });

  it("americanPrice wrapper matches the explicit american style", () => {
    expect(americanPrice(americanPut, { steps: 200 })).toBeCloseTo(
      binomialPrice(americanPut, { steps: 200, style: "american" }),
      12,
    );
  });
});

describe("binomialPrice - guards and degenerate inputs", () => {
  it("rejects non-integer, zero, and negative steps", () => {
    expect(() => binomialPrice(euroCall, { steps: 0 })).toThrow(RangeError);
    expect(() => binomialPrice(euroCall, { steps: -5 })).toThrow(RangeError);
    expect(() => binomialPrice(euroCall, { steps: 10.5 })).toThrow(RangeError);
  });

  it("rejects steps above the cap", () => {
    expect(() => binomialPrice(euroCall, { steps: MAX_STEPS + 1 })).toThrow(/exceeds cap/);
  });

  it("throws a clear error when the tree is unstable", () => {
    // tiny vol against a large rate pushes p outside [0,1] at coarse steps
    const unstable: OptionInputs = {
      type: "call",
      S: 100,
      K: 100,
      r: 2.5,
      sigma: 0.02,
      T: 1,
      q: 0,
    };
    expect(() => binomialPrice(unstable, { steps: 5, averageSteps: false })).toThrow(/unstable/);
  });

  it("falls back to intrinsic at expiry and at zero vol", () => {
    expect(binomialPrice({ ...euroCall, S: 120, T: 0 })).toBeCloseTo(20, 12);
    expect(binomialPrice({ ...euroCall, sigma: 0 })).toBeCloseTo(
      blackScholesPrice({ ...euroCall, sigma: 0 }),
      12,
    );
  });

  it("defaults to american with averaging at DEFAULT_STEPS", () => {
    expect(DEFAULT_STEPS).toBe(256);
    const put: OptionInputs = { type: "put", S: 90, K: 100, r: 0.05, sigma: 0.3, T: 1 };
    expect(binomialPrice(put)).toBeCloseTo(
      binomialPrice(put, { steps: DEFAULT_STEPS, style: "american", averageSteps: true }),
      12,
    );
  });
});
