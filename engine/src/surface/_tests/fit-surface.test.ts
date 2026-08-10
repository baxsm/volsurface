import { describe, expect, it } from "vitest";
import type { SviParams, SviSliceInput } from "../../types";
import { fitSurface, toSviQuote } from "../index";
import { sviTotalVariance } from "../svi";

const truth: SviParams = { a: 0.03, b: 0.12, rho: -0.4, m: 0.02, sigma: 0.15 };
const SPREAD = [-0.4, -0.25, -0.12, -0.05, 0, 0.05, 0.12, 0.25, 0.4];

const sliceInput = (expiration: string, t: number, level = 0): SviSliceInput => ({
  expiration,
  t,
  forward: 100,
  quotes: SPREAD.map((k) => ({
    k,
    w: sviTotalVariance({ ...truth, a: truth.a + level }, k),
    weight: 1,
  })),
});

describe("toSviQuote", () => {
  it("converts a strike and vol into log-moneyness and total variance", () => {
    const quote = toSviQuote(110, 100, 0.25, 0.5);
    expect(quote?.k).toBeCloseTo(Math.log(1.1), 12);
    expect(quote?.w).toBeCloseTo(0.25 * 0.25 * 0.5, 12);
    expect(quote?.weight).toBe(1);
  });

  it("carries a custom weight through", () => {
    expect(toSviQuote(110, 100, 0.25, 0.5, 0.3)?.weight).toBe(0.3);
  });

  it("rejects inputs that cannot produce a quote", () => {
    expect(toSviQuote(0, 100, 0.25, 0.5)).toBeNull();
    expect(toSviQuote(110, 0, 0.25, 0.5)).toBeNull();
    expect(toSviQuote(110, 100, 0, 0.5)).toBeNull();
    expect(toSviQuote(110, 100, 0.25, 0)).toBeNull();
  });
});

describe("fitSurface", () => {
  it("fits every slice it is given and renders a mesh", () => {
    const result = fitSurface([
      sliceInput("2026-09-18", 0.25),
      sliceInput("2026-12-18", 0.5, 0.02),
    ]);

    expect(result.slices).toHaveLength(2);
    expect(result.skippedExpirations).toEqual([]);
    expect(result.calendarArbFree).toBe(true);
    expect(result.grid.expiries).toEqual(["2026-09-18", "2026-12-18"]);
  });

  it("returns an empty surface when nothing could be fitted", () => {
    const thin: SviSliceInput = {
      expiration: "2026-09-18",
      t: 0.25,
      forward: 100,
      quotes: [{ k: 0, w: 0.01, weight: 1 }],
    };

    const result = fitSurface([thin]);
    expect(result.slices).toEqual([]);
    expect(result.grid.expiries).toEqual([]);
    expect(result.grid.iv).toEqual([]);
    expect(result.calendarArbFree).toBe(true);
    expect(result.crossings).toEqual([]);
    expect(result.skippedExpirations).toEqual(["2026-09-18"]);
  });

  it("handles being given no slices at all", () => {
    const result = fitSurface([]);
    expect(result.slices).toEqual([]);
    expect(result.skippedExpirations).toEqual([]);
    expect(result.grid.moneyness).toEqual([]);
  });

  it("reports the expiries it skipped instead of silently dropping them", () => {
    const result = fitSurface([
      sliceInput("2026-09-18", 0.25),
      { expiration: "2026-10-16", t: 0.33, forward: 100, quotes: [{ k: 0, w: 0.01, weight: 1 }] },
    ]);

    expect(result.slices).toHaveLength(1);
    expect(result.skippedExpirations).toEqual(["2026-10-16"]);
  });

  it("repairs and reports a crossing term structure", () => {
    // the later expiry is deliberately fitted below the earlier one
    const result = fitSurface([
      sliceInput("2026-09-18", 0.25, 0.05),
      sliceInput("2026-12-18", 0.5, 0),
    ]);

    expect(result.crossings.length).toBeGreaterThan(0);
    expect(result.calendarArbFree).toBe(true);
    expect(result.slices[1]?.calendarRepaired).toBe(true);
  });

  it("passes grid options through to the mesh", () => {
    const result = fitSurface([sliceInput("2026-09-18", 0.25)], {
      strikeSteps: 7,
      kRange: 0.2,
      extrapolate: true,
    });

    expect(result.grid.moneyness).toHaveLength(7);
    expect(result.grid.moneyness[0]).toBeCloseTo(-0.2, 12);
    // with extrapolation on, no node is left empty
    expect(result.grid.iv[0]?.every((v) => v !== null)).toBe(true);
  });
});
