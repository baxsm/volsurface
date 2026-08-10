import { describe, expect, it } from "vitest";
import type { OptionInputs, OptionType } from "../../types";
import { blackScholesGreeks, blackScholesPrice, blackScholesVega } from "../black-scholes";

const base = { S: 100, K: 100, r: 0.05, sigma: 0.2, T: 1, q: 0 };

describe("blackScholesPrice", () => {
  it("matches the golden reference case", () => {
    // S=100 K=100 r=5% sigma=20% T=1 q=0 -> d1=0.35, d2=0.15
    expect(blackScholesPrice({ ...base, type: "call" })).toBeCloseTo(10.4506, 4);
    expect(blackScholesPrice({ ...base, type: "put" })).toBeCloseTo(5.5735, 4);
  });

  it("satisfies put-call parity to machine precision", () => {
    const cases: OptionInputs[] = [
      { ...base, type: "call" },
      { type: "call", S: 42, K: 40, r: 0.1, sigma: 0.2, T: 0.5, q: 0 },
      { type: "call", S: 150, K: 90, r: 0.03, sigma: 0.55, T: 2.5, q: 0.02 },
      { type: "call", S: 7, K: 300, r: 0.01, sigma: 0.9, T: 0.25, q: 0.07 },
    ];

    for (const c of cases) {
      const call = blackScholesPrice({ ...c, type: "call" });
      const put = blackScholesPrice({ ...c, type: "put" });
      const q = c.q ?? 0;
      const parity = c.S * Math.exp(-q * c.T) - c.K * Math.exp(-c.r * c.T);
      expect(call - put).toBeCloseTo(parity, 12);
    }
  });

  it("is monotonic in vol and bounded by no-arbitrage limits", () => {
    let prev = -1;
    for (let sigma = 0.01; sigma <= 2; sigma += 0.01) {
      const price = blackScholesPrice({ ...base, type: "call", sigma });
      expect(price).toBeGreaterThan(prev);
      expect(price).toBeLessThanOrEqual(base.S + 1e-9);
      prev = price;
    }
  });

  it("respects intrinsic value bounds", () => {
    for (const S of [60, 100, 140]) {
      for (const type of ["call", "put"] as OptionType[]) {
        const price = blackScholesPrice({ ...base, type, S });
        const fwd = S;
        const disc = base.K * Math.exp(-base.r * base.T);
        const lower = type === "call" ? Math.max(fwd - disc, 0) : Math.max(disc - fwd, 0);
        expect(price).toBeGreaterThanOrEqual(lower - 1e-9);
      }
    }
  });

  it("collapses to intrinsic at expiry", () => {
    expect(blackScholesPrice({ ...base, type: "call", S: 120, T: 0 })).toBeCloseTo(20, 12);
    expect(blackScholesPrice({ ...base, type: "call", S: 80, T: 0 })).toBeCloseTo(0, 12);
    expect(blackScholesPrice({ ...base, type: "put", S: 80, T: 0 })).toBeCloseTo(20, 12);
    expect(blackScholesPrice({ ...base, type: "put", S: 120, T: 0 })).toBeCloseTo(0, 12);
  });

  it("collapses to discounted intrinsic at zero vol", () => {
    const price = blackScholesPrice({ ...base, type: "call", sigma: 0 });
    expect(price).toBeCloseTo(100 - 100 * Math.exp(-0.05), 12);
  });

  it("prices the dividend yield in", () => {
    const noDiv = blackScholesPrice({ ...base, type: "call", q: 0 });
    const withDiv = blackScholesPrice({ ...base, type: "call", q: 0.05 });
    expect(withDiv).toBeLessThan(noDiv);
  });

  it("defaults q to 0 when omitted", () => {
    const omitted = blackScholesPrice({ type: "call", S: 100, K: 100, r: 0.05, sigma: 0.2, T: 1 });
    expect(omitted).toBeCloseTo(blackScholesPrice({ ...base, type: "call" }), 15);
  });
});

// central finite-difference oracle: every analytic greek is checked against a
// numeric bump of the price function, which catches sign and scaling errors.
const fd = (f: (x: number) => number, x: number, h: number): number =>
  (f(x + h) - f(x - h)) / (2 * h);

describe("blackScholesGreeks", () => {
  const cases: OptionInputs[] = [
    { ...base, type: "call" },
    { ...base, type: "put" },
    { type: "call", S: 120, K: 100, r: 0.03, sigma: 0.35, T: 0.5, q: 0.02 },
    { type: "put", S: 85, K: 100, r: 0.06, sigma: 0.45, T: 2, q: 0.01 },
  ];

  it("delta matches a finite-difference bump in spot", () => {
    for (const c of cases) {
      const g = blackScholesGreeks(c);
      const numeric = fd((S) => blackScholesPrice({ ...c, S }), c.S, 1e-4 * c.S);
      expect(g.delta).toBeCloseTo(numeric, 6);
    }
  });

  it("gamma matches a second difference in spot", () => {
    for (const c of cases) {
      const g = blackScholesGreeks(c);
      const h = 1e-3 * c.S;
      const numeric =
        (blackScholesPrice({ ...c, S: c.S + h }) -
          2 * blackScholesPrice({ ...c, S: c.S }) +
          blackScholesPrice({ ...c, S: c.S - h })) /
        (h * h);
      expect(g.gamma).toBeCloseTo(numeric, 6);
    }
  });

  it("vega matches a bump in vol and is per 1.00 of vol", () => {
    for (const c of cases) {
      const g = blackScholesGreeks(c);
      const numeric = fd((sigma) => blackScholesPrice({ ...c, sigma }), c.sigma, 1e-5);
      expect(g.vega).toBeCloseTo(numeric, 5);
    }
  });

  it("theta matches a bump in time and is per year", () => {
    for (const c of cases) {
      const g = blackScholesGreeks(c);
      // price decays as T shrinks, so dV/dt = -dV/dT
      const numeric = -fd((T) => blackScholesPrice({ ...c, T }), c.T, 1e-5);
      expect(g.theta).toBeCloseTo(numeric, 5);
    }
  });

  it("rho matches a bump in rate and is per 1.00 of rate", () => {
    for (const c of cases) {
      const g = blackScholesGreeks(c);
      const numeric = fd((r) => blackScholesPrice({ ...c, r }), c.r, 1e-6);
      expect(g.rho).toBeCloseTo(numeric, 5);
    }
  });

  it("gamma and vega are identical for calls and puts", () => {
    const call = blackScholesGreeks({ ...base, type: "call" });
    const put = blackScholesGreeks({ ...base, type: "put" });
    expect(call.gamma).toBeCloseTo(put.gamma, 15);
    expect(call.vega).toBeCloseTo(put.vega, 15);
  });

  it("delta stays in range and has the right sign", () => {
    for (const S of [50, 80, 100, 130, 200]) {
      const call = blackScholesGreeks({ ...base, type: "call", S });
      const put = blackScholesGreeks({ ...base, type: "put", S });
      expect(call.delta).toBeGreaterThan(0);
      expect(call.delta).toBeLessThan(1);
      expect(put.delta).toBeLessThan(0);
      expect(put.delta).toBeGreaterThan(-1);
      // delta_call - delta_put = e^-qT  (=1 at q=0)
      expect(call.delta - put.delta).toBeCloseTo(1, 12);
    }
  });

  it("returns the step-function delta at expiry", () => {
    expect(blackScholesGreeks({ ...base, type: "call", S: 120, T: 0 }).delta).toBe(1);
    expect(blackScholesGreeks({ ...base, type: "call", S: 80, T: 0 }).delta).toBe(0);
    expect(blackScholesGreeks({ ...base, type: "put", S: 80, T: 0 }).delta).toBe(-1);
    expect(blackScholesGreeks({ ...base, type: "call", S: 100, T: 0 }).delta).toBe(0.5);
    expect(blackScholesGreeks({ ...base, type: "call", S: 100, T: 0 }).gamma).toBe(0);
  });
});

describe("blackScholesVega", () => {
  it("matches the vega from the full greeks", () => {
    const g = blackScholesGreeks({ ...base, type: "call" });
    expect(blackScholesVega(base)).toBeCloseTo(g.vega, 15);
  });

  it("is zero in the degenerate cases", () => {
    expect(blackScholesVega({ ...base, T: 0 })).toBe(0);
    expect(blackScholesVega({ ...base, sigma: 0 })).toBe(0);
  });
});
