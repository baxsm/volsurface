import { describe, expect, it } from "vitest";
import type { SviParams, SviSliceFit } from "../../types";
import { buildSurfaceGrid } from "../grid";
import { sviImpliedVol } from "../svi";

const slice = (expiration: string, t: number, params: SviParams): SviSliceFit => ({
  expiration,
  t,
  params,
  quoteCount: 10,
  rmse: 0,
  iterations: 1,
  butterflyArbFree: true,
  kMin: -1.5,
  kMax: 1.5,
});

const slices = [
  slice("2026-08-21", 0.1, { a: 0.01, b: 0.05, rho: -0.2, m: 0, sigma: 0.2 }),
  slice("2026-09-18", 0.3, { a: 0.03, b: 0.06, rho: -0.2, m: 0, sigma: 0.2 }),
];

const forwards = new Map([
  ["2026-08-21", 100],
  ["2026-09-18", 101],
]);

describe("buildSurfaceGrid", () => {
  it("shapes the mesh as expiries by moneyness", () => {
    const grid = buildSurfaceGrid(slices, forwards, { strikeSteps: 12 });

    expect(grid.moneyness).toHaveLength(12);
    expect(grid.expiries).toEqual(["2026-08-21", "2026-09-18"]);
    expect(grid.years).toEqual([0.1, 0.3]);
    expect(grid.iv).toHaveLength(2);
    expect(grid.iv[0]).toHaveLength(12);
    expect(grid.strikes[0]).toHaveLength(12);
  });

  it("samples moneyness symmetrically around the forward", () => {
    const grid = buildSurfaceGrid(slices, forwards, { strikeSteps: 9, kRange: 0.4 });
    expect(grid.moneyness[0]).toBeCloseTo(-0.4, 12);
    expect(grid.moneyness[8]).toBeCloseTo(0.4, 12);
    expect(grid.moneyness[4]).toBeCloseTo(0, 12);
  });

  it("converts moneyness to strikes using each expiry's own forward", () => {
    const grid = buildSurfaceGrid(slices, forwards, { strikeSteps: 3, kRange: 0.1 });
    // middle column is k = 0, so the strike is the forward itself
    expect(grid.strikes[0]?.[1]).toBeCloseTo(100, 9);
    expect(grid.strikes[1]?.[1]).toBeCloseTo(101, 9);
    // outer columns are forward * exp(+/- 0.1)
    expect(grid.strikes[0]?.[0]).toBeCloseTo(100 * Math.exp(-0.1), 9);
    expect(grid.strikes[0]?.[2]).toBeCloseTo(100 * Math.exp(0.1), 9);
  });

  it("fills iv from the slice the row belongs to", () => {
    const grid = buildSurfaceGrid(slices, forwards, { strikeSteps: 5 });
    for (let row = 0; row < slices.length; row++) {
      const current = slices[row] as SviSliceFit;
      for (let col = 0; col < grid.moneyness.length; col++) {
        const k = grid.moneyness[col] as number;
        expect(grid.iv[row]?.[col]).toBe(sviImpliedVol(current.params, k, current.t));
      }
    }
  });

  it("sorts slices by expiry regardless of input order", () => {
    const grid = buildSurfaceGrid([slices[1], slices[0]] as SviSliceFit[], forwards);
    expect(grid.expiries).toEqual(["2026-08-21", "2026-09-18"]);
  });

  it("marks strikes NaN when an expiry has no forward, rather than guessing one", () => {
    const grid = buildSurfaceGrid(slices, new Map([["2026-08-21", 100]]), { strikeSteps: 4 });
    expect(grid.strikes[0]?.every((s) => Number.isFinite(s))).toBe(true);
    expect(grid.strikes[1]?.every((s) => Number.isNaN(s))).toBe(true);
    // the iv row is still valid - only the strike axis is unknown
    expect(grid.iv[1]?.every((v) => v !== null)).toBe(true);
  });

  it("returns empty axes for no slices", () => {
    const grid = buildSurfaceGrid([], forwards);
    expect(grid.expiries).toEqual([]);
    expect(grid.iv).toEqual([]);
    expect(grid.strikes).toEqual([]);
  });
});
