import { describe, expect, it } from "vitest";
import { gridOver, payoffDomain, resample, withCrossings } from "../payoff-geometry";
import type { PayoffPoint } from "../strategy";

const line = (from: number, to: number, f: (spot: number) => number): PayoffPoint[] =>
  Array.from({ length: to - from + 1 }, (_, i) => ({ spot: from + i, profit: f(from + i) }));

describe("payoffDomain", () => {
  it("returns null for a curve with nothing to draw", () => {
    expect(payoffDomain([])).toBeNull();
    expect(payoffDomain([{ spot: 10, profit: 1 }])).toBeNull();
  });

  it("returns null when every sample sits on one spot", () => {
    expect(
      payoffDomain([
        { spot: 10, profit: 1 },
        { spot: 10, profit: 2 },
      ]),
    ).toBeNull();
  });

  it("covers the full spot range", () => {
    const domain = payoffDomain(line(100, 120, (s) => s - 110));
    expect(domain?.minSpot).toBe(100);
    expect(domain?.maxSpot).toBe(120);
  });

  it("keeps zero in frame even when the position only ever loses", () => {
    const domain = payoffDomain(line(100, 120, () => -5));
    expect(domain?.maxProfit).toBeGreaterThanOrEqual(0);
  });

  it("keeps zero in frame when the position only ever profits", () => {
    const domain = payoffDomain(line(100, 120, () => 5));
    expect(domain?.minProfit).toBeLessThanOrEqual(0);
  });

  it("leaves headroom past the extremes so the curve is not flush to the frame", () => {
    const domain = payoffDomain(line(100, 120, (s) => s - 110));
    expect(domain?.maxProfit).toBeGreaterThan(10);
    expect(domain?.minProfit).toBeLessThan(-10);
  });
});

describe("withCrossings", () => {
  it("inserts a vertex exactly on the breakeven", () => {
    const out = withCrossings([
      { spot: 100, profit: -10 },
      { spot: 120, profit: 10 },
    ]);
    expect(out).toHaveLength(3);
    expect(out[1]?.profit).toBe(0);
    expect(out[1]?.spot).toBeCloseTo(110);
  });

  it("handles a curve that crosses zero more than once", () => {
    const out = withCrossings(line(100, 140, (s) => -Math.abs(s - 120) + 10));
    expect(out.filter((p) => p.profit === 0)).toHaveLength(2);
  });

  it("adds nothing when the curve never crosses", () => {
    const points = line(100, 110, () => -3);
    expect(withCrossings(points)).toHaveLength(points.length);
  });

  it("does not duplicate a sample that already sits on zero", () => {
    const out = withCrossings([
      { spot: 100, profit: -5 },
      { spot: 110, profit: 0 },
      { spot: 120, profit: 5 },
    ]);
    expect(out).toHaveLength(3);
  });

  it("leaves a curve too short to cross alone", () => {
    expect(withCrossings([{ spot: 1, profit: 1 }])).toHaveLength(1);
  });
});

describe("resample", () => {
  it("gives both curves the same vertex count so a spring can tween them", () => {
    const grid = gridOver(100, 120, 40);
    const a = resample(
      line(100, 120, (s) => s - 110),
      grid,
    );
    const b = resample(
      line(105, 118, (s) => (s - 110) * 2),
      grid,
    );
    expect(a).toHaveLength(41);
    expect(b).toHaveLength(41);
  });

  it("interpolates between samples", () => {
    const out = resample(
      [
        { spot: 100, profit: 0 },
        { spot: 110, profit: 10 },
      ],
      [105],
    );
    expect(out[0]?.profit).toBeCloseTo(5);
  });

  it("holds the end value outside the sampled window rather than extrapolating", () => {
    const points = [
      { spot: 100, profit: 2 },
      { spot: 110, profit: 8 },
    ];
    expect(resample(points, [90])[0]?.profit).toBe(2);
    expect(resample(points, [130])[0]?.profit).toBe(8);
  });

  it("returns a flat curve when there is nothing to resample", () => {
    expect(resample([], [1, 2])).toEqual([
      { spot: 1, profit: 0 },
      { spot: 2, profit: 0 },
    ]);
  });
});

describe("gridOver", () => {
  it("spans the window inclusive of both ends", () => {
    const grid = gridOver(100, 120, 4);
    expect(grid).toEqual([100, 105, 110, 115, 120]);
  });
});
