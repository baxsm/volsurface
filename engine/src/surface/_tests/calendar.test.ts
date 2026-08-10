import { describe, expect, it } from "vitest";
import type { SviParams, SviSliceFit } from "../../types";
import { enforceCalendar, liftToDominate, sharedKGrid, worstCrossing } from "../calendar";
import { butterflyViolations, sviTotalVariance } from "../svi";

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

// a flat-ish term structure where each slice sits strictly above the previous
const rising = [
  slice("2026-08-21", 0.1, { a: 0.01, b: 0.05, rho: -0.2, m: 0, sigma: 0.2 }),
  slice("2026-09-18", 0.3, { a: 0.03, b: 0.06, rho: -0.2, m: 0, sigma: 0.2 }),
  slice("2026-12-18", 0.6, { a: 0.06, b: 0.07, rho: -0.2, m: 0, sigma: 0.2 }),
];

describe("sharedKGrid", () => {
  it("spans the overlap of the two slices' quoted ranges", () => {
    const narrow = { ...(rising[0] as SviSliceFit), kMin: -0.4, kMax: 0.2 };
    const wide = { ...(rising[1] as SviSliceFit), kMin: -0.9, kMax: 0.5 };

    const ks = sharedKGrid(narrow, wide);
    expect(ks.length).toBeGreaterThan(50);
    expect(ks[0]).toBeCloseTo(-0.4, 12);
    expect(ks[ks.length - 1]).toBeCloseTo(0.2, 12);
  });

  it("returns nothing when the two slices never overlap", () => {
    const left = { ...(rising[0] as SviSliceFit), kMin: -0.9, kMax: -0.5 };
    const right = { ...(rising[1] as SviSliceFit), kMin: 0.2, kMax: 0.6 };
    expect(sharedKGrid(left, right)).toEqual([]);
  });

  it("treats two slices with no comparable region as non-crossing", () => {
    // nothing to compare means nothing can be asserted to cross, so the pair
    // must pass rather than be repaired on the strength of extrapolated wings
    const left = { ...(rising[0] as SviSliceFit), kMin: -0.9, kMax: -0.5 };
    const right = {
      ...(rising[1] as SviSliceFit),
      kMin: 0.2,
      kMax: 0.6,
      params: { a: 0.0001, b: 0.05, rho: 0, m: 0, sigma: 0.2 },
    };
    expect(worstCrossing(left, right)).toBeNull();
  });
});

describe("worstCrossing", () => {
  it("returns null when the later slice dominates everywhere", () => {
    expect(worstCrossing(rising[0] as SviSliceFit, rising[1] as SviSliceFit)).toBeNull();
  });

  it("finds a crossing when the later slice dips below the earlier one", () => {
    const earlier = slice("2026-08-21", 0.1, { a: 0.09, b: 0.05, rho: 0, m: 0, sigma: 0.2 });
    const later = slice("2026-09-18", 0.3, { a: 0.02, b: 0.05, rho: 0, m: 0, sigma: 0.2 });

    const crossing = worstCrossing(earlier, later);
    expect(crossing).not.toBeNull();
    const found = crossing as NonNullable<typeof crossing>;
    expect(found.earlierExpiration).toBe("2026-08-21");
    expect(found.laterExpiration).toBe("2026-09-18");
    // both slices share a shape, so the gap is the level difference everywhere
    expect(found.gap).toBeCloseTo(0.07, 6);
  });

  it("reports the widest gap, not the first one found", () => {
    // steeper wings on the earlier slice mean the gap grows away from the vertex
    const earlier = slice("2026-08-21", 0.1, { a: 0.05, b: 0.5, rho: 0, m: 0, sigma: 0.05 });
    const later = slice("2026-09-18", 0.3, { a: 0.05, b: 0.05, rho: 0, m: 0, sigma: 0.05 });

    const crossing = worstCrossing(earlier, later);
    const found = crossing as NonNullable<typeof crossing>;
    // the worst gap must sit at one of the grid extremes for this pair
    expect(Math.abs(found.k)).toBeCloseTo(1.5, 6);
  });
});

describe("liftToDominate", () => {
  it("returns the slice untouched when there is no crossing", () => {
    const later = rising[1] as SviSliceFit;
    expect(liftToDominate(rising[0] as SviSliceFit, later)).toBe(later);
  });

  it("lifts a crossing slice until it dominates", () => {
    const earlier = slice("2026-08-21", 0.1, { a: 0.09, b: 0.05, rho: 0, m: 0, sigma: 0.2 });
    const later = slice("2026-09-18", 0.3, { a: 0.02, b: 0.05, rho: 0, m: 0, sigma: 0.2 });

    const lifted = liftToDominate(earlier, later);
    expect(lifted.calendarRepaired).toBe(true);
    expect(worstCrossing(earlier, lifted)).toBeNull();
  });

  it("keeps the lifted slice butterfly arb-free", () => {
    const earlier = slice("2026-08-21", 0.1, { a: 0.5, b: 0.05, rho: -0.5, m: 0, sigma: 0.2 });
    const later = slice("2026-09-18", 0.3, { a: 0.01, b: 0.05, rho: -0.5, m: 0, sigma: 0.2 });

    const lifted = liftToDominate(earlier, later);
    expect(butterflyViolations(lifted.params)).toEqual([]);
  });

  it("preserves skew and wing shape, changing only the level", () => {
    const earlier = slice("2026-08-21", 0.1, { a: 0.09, b: 0.05, rho: -0.4, m: 0.03, sigma: 0.2 });
    const later = slice("2026-09-18", 0.3, { a: 0.02, b: 0.05, rho: -0.4, m: 0.03, sigma: 0.2 });

    const lifted = liftToDominate(earlier, later);
    expect(lifted.params.b).toBeCloseTo(later.params.b, 12);
    expect(lifted.params.rho).toBeCloseTo(later.params.rho, 12);
    expect(lifted.params.m).toBeCloseTo(later.params.m, 12);
    expect(lifted.params.sigma).toBeCloseTo(later.params.sigma, 12);
    expect(lifted.params.a).toBeGreaterThan(later.params.a);
  });
});

describe("enforceCalendar", () => {
  it("passes a well-ordered term structure through unchanged", () => {
    const result = enforceCalendar(rising);
    expect(result.calendarArbFree).toBe(true);
    expect(result.crossings).toEqual([]);
    expect(result.slices.map((s) => s.expiration)).toEqual([
      "2026-08-21",
      "2026-09-18",
      "2026-12-18",
    ]);
  });

  it("sorts slices by expiry before checking", () => {
    const shuffled = [rising[2], rising[0], rising[1]] as SviSliceFit[];
    const result = enforceCalendar(shuffled);
    expect(result.slices.map((s) => s.t)).toEqual([0.1, 0.3, 0.6]);
  });

  it("repairs a crossing and reports it", () => {
    const crossing = [
      slice("2026-08-21", 0.1, { a: 0.09, b: 0.05, rho: 0, m: 0, sigma: 0.2 }),
      slice("2026-09-18", 0.3, { a: 0.02, b: 0.05, rho: 0, m: 0, sigma: 0.2 }),
    ];
    const result = enforceCalendar(crossing);

    expect(result.crossings).toHaveLength(1);
    expect(result.calendarArbFree).toBe(true);
    expect(result.slices[1]?.calendarRepaired).toBe(true);
  });

  it("propagates a repair forward so no later pair is left crossing", () => {
    // the middle slice sits far below the first. lifting it must not leave it
    // above the third, which would push the crossing one step down the chain
    const chain = [
      slice("2026-08-21", 0.1, { a: 0.2, b: 0.05, rho: 0, m: 0, sigma: 0.2 }),
      slice("2026-09-18", 0.3, { a: 0.01, b: 0.05, rho: 0, m: 0, sigma: 0.2 }),
      slice("2026-12-18", 0.6, { a: 0.05, b: 0.05, rho: 0, m: 0, sigma: 0.2 }),
    ];
    const result = enforceCalendar(chain);

    expect(result.calendarArbFree).toBe(true);
    for (let i = 1; i < result.slices.length; i++) {
      expect(
        worstCrossing(result.slices[i - 1] as SviSliceFit, result.slices[i] as SviSliceFit),
      ).toBeNull();
    }
  });

  it("leaves total variance non-decreasing in maturity at every k", () => {
    const chain = [
      slice("2026-08-21", 0.1, { a: 0.2, b: 0.05, rho: -0.3, m: 0, sigma: 0.2 }),
      slice("2026-09-18", 0.3, { a: 0.01, b: 0.08, rho: -0.1, m: 0.1, sigma: 0.15 }),
      slice("2026-12-18", 0.6, { a: 0.05, b: 0.06, rho: -0.5, m: -0.05, sigma: 0.25 }),
    ];
    const result = enforceCalendar(chain);

    for (const k of sharedKGrid(result.slices[0] as SviSliceFit, result.slices[2] as SviSliceFit)) {
      for (let i = 1; i < result.slices.length; i++) {
        const earlier = sviTotalVariance((result.slices[i - 1] as SviSliceFit).params, k);
        const later = sviTotalVariance((result.slices[i] as SviSliceFit).params, k);
        expect(later).toBeGreaterThanOrEqual(earlier - 1e-9);
      }
    }
  });

  it("handles a single slice", () => {
    const result = enforceCalendar([rising[0] as SviSliceFit]);
    expect(result.calendarArbFree).toBe(true);
    expect(result.slices).toHaveLength(1);
  });

  it("handles an empty term structure", () => {
    const result = enforceCalendar([]);
    expect(result.calendarArbFree).toBe(true);
    expect(result.slices).toEqual([]);
  });
});
