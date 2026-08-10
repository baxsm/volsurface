import { describe, expect, it } from "vitest";
import {
  areaPaths,
  type Box,
  buildScale,
  gridOver,
  linePath,
  resample,
  spotTicks,
} from "../payoff-geometry";
import type { PayoffPoint } from "../strategy";

const box: Box = { width: 400, height: 200, padLeft: 40, padRight: 20, padTop: 20, padBottom: 30 };

const line = (from: number, to: number, f: (spot: number) => number): PayoffPoint[] =>
  Array.from({ length: to - from + 1 }, (_, i) => ({ spot: from + i, profit: f(from + i) }));

describe("buildScale", () => {
  it("returns null for a curve with nothing to draw", () => {
    expect(buildScale([], box)).toBeNull();
    expect(buildScale([{ spot: 10, profit: 1 }], box)).toBeNull();
  });

  it("returns null when every sample sits on one spot", () => {
    expect(
      buildScale(
        [
          { spot: 10, profit: 1 },
          { spot: 10, profit: 2 },
        ],
        box,
      ),
    ).toBeNull();
  });

  it("maps the spot domain across the inner width", () => {
    const scale = buildScale(
      line(100, 120, (s) => s - 110),
      box,
    );
    expect(scale).not.toBeNull();
    expect(scale?.x(100)).toBeCloseTo(40);
    expect(scale?.x(120)).toBeCloseTo(380);
  });

  it("keeps zero in frame even when the position only ever loses", () => {
    const scale = buildScale(
      line(100, 120, () => -5),
      box,
    );
    expect(scale).not.toBeNull();
    expect(scale?.domain.maxProfit).toBeGreaterThanOrEqual(0);
    expect(scale?.zeroY).toBeLessThanOrEqual(box.height - box.padBottom);
  });

  it("keeps zero in frame when the position only ever profits", () => {
    const scale = buildScale(
      line(100, 120, () => 5),
      box,
    );
    expect(scale?.domain.minProfit).toBeLessThanOrEqual(0);
    expect(scale?.zeroY).toBeGreaterThanOrEqual(box.padTop);
  });

  it("puts higher profit higher on screen", () => {
    const scale = buildScale(
      line(100, 120, (s) => s - 110),
      box,
    );
    expect(scale?.y(10)).toBeLessThan(scale?.y(-10) ?? 0);
  });
});

describe("linePath", () => {
  it("draws one vertex per sample with no smoothing", () => {
    const points = line(100, 104, (s) => s - 102);
    const scale = buildScale(points, box);
    if (scale === null) throw new Error("scale");
    const path = linePath(points, scale);
    expect(path.startsWith("M")).toBe(true);
    expect(path.match(/L/g)).toHaveLength(4);
    expect(path).not.toContain("C");
  });
});

describe("areaPaths", () => {
  it("splits profit and loss into separate closed fills", () => {
    const points = line(100, 120, (s) => s - 110);
    const scale = buildScale(points, box);
    if (scale === null) throw new Error("scale");
    const { positive, negative } = areaPaths(points, scale);
    expect(positive).not.toBe("");
    expect(negative).not.toBe("");
    expect(positive.endsWith("Z")).toBe(true);
    expect(negative.endsWith("Z")).toBe(true);
  });

  it("leaves the profit fill empty when the position never profits", () => {
    const points = line(100, 120, () => -3);
    const scale = buildScale(points, box);
    if (scale === null) throw new Error("scale");
    expect(areaPaths(points, scale).positive).toBe("");
  });

  // the fills meeting anywhere but the breakeven is the tell that the split
  // happened per-sample instead of on the real crossing
  it("meets the two fills on the zero crossing", () => {
    const points = line(100, 120, (s) => s - 110);
    const scale = buildScale(points, box);
    if (scale === null) throw new Error("scale");
    const { negative } = areaPaths(points, scale);
    const crossing = scale.x(110).toFixed(2);
    expect(negative).toContain(crossing);
  });

  it("handles a curve that crosses zero more than once", () => {
    const points = line(100, 140, (s) => -Math.abs(s - 120) + 10);
    const scale = buildScale(points, box);
    if (scale === null) throw new Error("scale");
    const { positive, negative } = areaPaths(points, scale);
    expect(positive.match(/Z/g)).toHaveLength(1);
    expect(negative.match(/Z/g)).toHaveLength(2);
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

describe("spotTicks", () => {
  it("picks round numbers inside the window", () => {
    const ticks = spotTicks(97, 253);
    expect(ticks.length).toBeGreaterThan(2);
    expect(ticks.every((t) => t >= 97 && t <= 253)).toBe(true);
    expect(ticks.every((t) => t % 10 === 0)).toBe(true);
  });

  it("returns nothing for an empty window", () => {
    expect(spotTicks(100, 100)).toEqual([]);
  });
});
