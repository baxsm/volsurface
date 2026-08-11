import { describe, expect, it } from "vitest";
import {
  buildSurfaceMesh,
  canMorph,
  colOffset,
  ivFraction,
  ivHeight,
  morphPositions,
  RAMP,
  rampColor,
  rowDepth,
  STAGE,
  sliceAtExpiry,
  sliceAtMoneyness,
  surfaceBounds,
} from "../surface-geometry";
import type { Surface, SurfaceGrid } from "../types";
import fixture from "./surface-fixture.json";

// the real fitted IBM surface the backend serves: 18 expiries x 48 moneyness
// samples with genuine gaps in the wings. synthetic grids would not exercise
// the gap handling that is the whole difficulty of the mesh build.
const real = fixture as unknown as Surface;
const realGrid = real.grid;

const flatGrid = (rows: number, cols: number, iv: (r: number, c: number) => number | null) => {
  const grid: SurfaceGrid = {
    moneyness: Array.from({ length: cols }, (_, c) => -0.3 + (0.6 * c) / (cols - 1)),
    expiries: Array.from({ length: rows }, (_, r) => `2026-0${r + 1}-01`),
    years: Array.from({ length: rows }, (_, r) => 0.1 + r * 0.5),
    strikes: Array.from({ length: rows }, () => Array.from({ length: cols }, (_, c) => 100 + c)),
    iv: Array.from({ length: rows }, (_, r) => Array.from({ length: cols }, (_, c) => iv(r, c))),
  };
  return grid;
};

describe("surfaceBounds", () => {
  it("reads the real fitted vol range", () => {
    const bounds = surfaceBounds(realGrid);
    expect(bounds).not.toBeNull();
    if (bounds === null) return;
    expect(bounds.minIv).toBeCloseTo(0.446, 2);
    expect(bounds.maxIv).toBeCloseTo(0.8747, 3);
    expect(bounds.minYears).toBeCloseTo(0.010958, 5);
    expect(bounds.maxYears).toBeCloseTo(2.40822, 4);
  });

  it("returns null when no cell carries a vol", () => {
    expect(surfaceBounds(flatGrid(3, 3, () => null))).toBeNull();
  });

  it("returns null for a grid too small to span an axis", () => {
    expect(surfaceBounds(flatGrid(1, 4, () => 0.3))).toBeNull();
  });
});

describe("rampColor", () => {
  it("hits the ramp endpoints", () => {
    const floor = RAMP[0] as readonly [number, number, number];
    const peak = RAMP[RAMP.length - 1] as readonly [number, number, number];
    for (let channel = 0; channel < 3; channel++) {
      expect(rampColor(0)[channel] as number).toBeCloseTo(floor[channel] as number, 12);
      expect(rampColor(1)[channel] as number).toBeCloseTo(peak[channel] as number, 12);
    }
  });

  it("passes through every intermediate stop", () => {
    for (let stop = 0; stop < RAMP.length; stop++) {
      const [r, g, b] = rampColor(stop / (RAMP.length - 1));
      const expected = RAMP[stop] as readonly [number, number, number];
      expect(r).toBeCloseTo(expected[0], 12);
      expect(g).toBeCloseTo(expected[1], 12);
      expect(b).toBeCloseTo(expected[2], 12);
    }
  });

  it("clamps outside the unit range instead of extrapolating a colour", () => {
    expect(rampColor(-5)).toEqual(rampColor(0));
    expect(rampColor(5)).toEqual(rampColor(1));
    expect(rampColor(Number.NaN)).toEqual(rampColor(0));
  });

  it("stays monotonic in green, so height reads as one continuous ramp", () => {
    let previous = -1;
    for (let i = 0; i <= 40; i++) {
      const [, green] = rampColor(i / 40);
      expect(green).toBeGreaterThanOrEqual(previous);
      previous = green;
    }
  });

  it("is not a rainbow: blue gives way to green once and never returns", () => {
    // a jet ramp cycles hue and comes back through blue at the top. this ramp
    // walks once from deep blue to a pale warm peak, so blue may lead green
    // only at the start: after it yields, it must never lead again.
    const leads = Array.from({ length: 41 }, (_, i) => {
      const [, g, b] = rampColor(i / 40);
      return b - g;
    });

    const yielded = leads.findIndex((lead) => lead < 0);
    expect(yielded).toBeGreaterThan(0);
    expect(leads.slice(yielded).every((lead) => lead < 0)).toBe(true);

    // and it ends warm, not blue
    const [rEnd, , bEnd] = rampColor(1);
    expect(rEnd).toBeGreaterThan(bEnd);
  });

  it("rises in luminance so height reads as brightness", () => {
    let previous = -1;
    for (let i = 0; i <= 40; i++) {
      const [r, g, b] = rampColor(i / 40);
      const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      expect(luminance).toBeGreaterThan(previous);
      previous = luminance;
    }
  });
});

describe("ivFraction", () => {
  const bounds = {
    minIv: 0.4,
    maxIv: 0.8,
    minMoneyness: -1,
    maxMoneyness: 1,
    minYears: 0,
    maxYears: 1,
  };

  it("maps the range onto 0..1", () => {
    expect(ivFraction(0.4, bounds)).toBe(0);
    expect(ivFraction(0.8, bounds)).toBe(1);
    expect(ivFraction(0.6, bounds)).toBeCloseTo(0.5, 12);
  });

  it("sits a flat surface mid height rather than dividing by zero", () => {
    expect(ivFraction(0.5, { ...bounds, minIv: 0.5, maxIv: 0.5 })).toBe(0.5);
  });
});

describe("ivHeight", () => {
  const bounds = {
    minIv: 0.4,
    maxIv: 0.8,
    minMoneyness: -1,
    maxMoneyness: 1,
    minYears: 0,
    maxYears: 1,
  };

  it("keeps the ends pinned so nothing is clipped away", () => {
    expect(ivHeight(0.4, bounds)).toBe(0);
    expect(ivHeight(0.8, bounds)).toBe(1);
  });

  it("stays monotonic, so it compresses the axis without reordering it", () => {
    let previous = -1;
    for (let i = 0; i <= 60; i++) {
      const iv = 0.4 + (0.4 * i) / 60;
      const height = ivHeight(iv, bounds);
      expect(height).toBeGreaterThanOrEqual(previous);
      previous = height;
    }
  });

  it("lifts the crowded low band off the floor on the real fit", () => {
    // the front expiry alone reaches 87% while the rest sit near 45-65%, so a
    // linear axis buries the median at a tenth of the height
    const real = surfaceBounds(realGrid);
    if (real === null) throw new Error("no bounds");

    const quoted = realGrid.iv.flat().filter((v): v is number => v !== null);
    const sorted = [...quoted].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)] as number;

    expect(ivFraction(median, real)).toBeLessThan(0.15);
    expect(ivHeight(median, real)).toBeGreaterThan(0.28);
  });
});

describe("buildSurfaceMesh", () => {
  it("builds one vertex per grid node from the real fit", () => {
    const mesh = buildSurfaceMesh(realGrid);
    expect(mesh).not.toBeNull();
    if (mesh === null) return;

    expect(mesh.rows).toBe(18);
    expect(mesh.cols).toBe(48);
    expect(mesh.positions.length).toBe(18 * 48 * 3);
    expect(mesh.colors.length).toBe(mesh.positions.length);
  });

  it("marks exactly the quoted nodes as filled", () => {
    const mesh = buildSurfaceMesh(realGrid);
    if (mesh === null) throw new Error("mesh did not build");

    const quoted = realGrid.iv.flat().filter((v) => v !== null).length;
    expect(mesh.filled.filter(Boolean).length).toBe(quoted);
    // the honest trapezoid: a quarter of the grid is gap, not zero
    expect(quoted).toBe(643);
  });

  it("omits every quad that touches a gap", () => {
    const mesh = buildSurfaceMesh(realGrid);
    if (mesh === null) throw new Error("mesh did not build");

    for (let i = 0; i < mesh.indices.length; i++) {
      const vertex = mesh.indices[i] as number;
      expect(mesh.filled[vertex]).toBe(true);
    }
  });

  it("keeps every vertex inside the stage box", () => {
    const mesh = buildSurfaceMesh(realGrid);
    if (mesh === null) throw new Error("mesh did not build");

    // float32 rounds, so the edge vertices land a hair outside the exact bound
    const slack = 1e-6;
    for (let i = 0; i < mesh.positions.length; i += 3) {
      expect(Math.abs(mesh.positions[i] as number)).toBeLessThanOrEqual(STAGE.width / 2 + slack);
      expect(mesh.positions[i + 1] as number).toBeGreaterThanOrEqual(0);
      expect(mesh.positions[i + 1] as number).toBeLessThanOrEqual(STAGE.height + slack);
      expect(Math.abs(mesh.positions[i + 2] as number)).toBeLessThanOrEqual(
        STAGE.depth / 2 + slack,
      );
    }
  });

  it("parks gap vertices at mid height instead of dropping them to the floor", () => {
    // a gap at height 0 would draw a cliff where the market never quoted
    const grid = flatGrid(3, 3, (r, c) => (r === 1 && c === 1 ? null : 0.5));
    const mesh = buildSurfaceMesh(grid);
    if (mesh === null) throw new Error("mesh did not build");

    const centre = 1 * 3 + 1;
    expect(mesh.filled[centre]).toBe(false);
    expect(mesh.positions[centre * 3 + 1]).toBeCloseTo(0.5 * STAGE.height, 6);
  });

  it("drops all four quads around a single interior gap", () => {
    const full = buildSurfaceMesh(flatGrid(3, 3, (r, c) => 0.4 + r * 0.1 + c * 0.01));
    const holed = buildSurfaceMesh(
      flatGrid(3, 3, (r, c) => (r === 1 && c === 1 ? null : 0.4 + r * 0.1 + c * 0.01)),
    );
    if (full === null || holed === null) throw new Error("mesh did not build");

    // 2x2 quads, each 2 triangles, each 3 indices
    expect(full.indices.length).toBe(4 * 6);
    expect(holed.indices.length).toBe(0);
  });

  it("traces the boundary of a full grid as its four sides", () => {
    const mesh = buildSurfaceMesh(flatGrid(3, 3, () => 0.5));
    if (mesh === null) throw new Error("mesh did not build");

    // a 3x3 grid with no gaps has 8 perimeter segments and no interior ones
    expect(mesh.edgeIndices.length / 2).toBe(8);
  });

  it("wraps a hole punched in the middle of the fitted region", () => {
    // 5x5 leaves a ring of quads around a single missing node, so the boundary
    // has to trace the inner hole as well as the outer rectangle
    const solid = buildSurfaceMesh(flatGrid(5, 5, () => 0.5));
    const holed = buildSurfaceMesh(flatGrid(5, 5, (r, c) => (r === 2 && c === 2 ? null : 0.5)));
    if (solid === null || holed === null) throw new Error("mesh did not build");

    expect(solid.edgeIndices.length / 2).toBe(16);
    expect(holed.edgeIndices.length / 2).toBe(16 + 8);
  });

  it("outlines the real fit without tracing interior segments", () => {
    const mesh = buildSurfaceMesh(realGrid);
    if (mesh === null) throw new Error("mesh did not build");

    expect(mesh.edgeIndices.length).toBeGreaterThan(0);
    // every boundary vertex has to be a quoted one
    for (let i = 0; i < mesh.edgeIndices.length; i++) {
      expect(mesh.filled[mesh.edgeIndices[i] as number]).toBe(true);
    }
    // the outline is a fraction of the wireframe, not a second copy of it
    expect(mesh.edgeIndices.length).toBeLessThan(mesh.wireIndices.length);
  });

  it("spreads the real fit across the ramp instead of leaving it all blue", () => {
    const mesh = buildSurfaceMesh(realGrid);
    if (mesh === null) throw new Error("mesh did not build");

    // green rises across the whole ramp, so it stands in for how far up the
    // ramp each vertex sits. under a linear map almost every quoted node lands
    // in the bottom sixth and the surface renders as one flat colour.
    const greens: number[] = [];
    for (let i = 0; i < mesh.filled.length; i++) {
      if (mesh.filled[i] === true) greens.push(mesh.colors[i * 3 + 1] as number);
    }

    const floor = RAMP[0]?.[1] as number;
    const peak = RAMP[RAMP.length - 1]?.[1] as number;
    const spread = greens.map((g) => (g - floor) / (peak - floor)).sort((a, b) => a - b);
    const median = spread[Math.floor(spread.length / 2)] as number;

    expect(median).toBeGreaterThan(0.25);
    // and the ramp is genuinely used across its length, not bunched at one end
    expect(spread[spread.length - 1] as number).toBeGreaterThan(0.9);
  });

  it("colours the peak and floor from opposite ends of the ramp", () => {
    const grid = flatGrid(2, 2, (r) => (r === 0 ? 0.2 : 0.9));
    const mesh = buildSurfaceMesh(grid);
    if (mesh === null) throw new Error("mesh did not build");

    const floor = RAMP[0] as readonly [number, number, number];
    const peak = RAMP[RAMP.length - 1] as readonly [number, number, number];
    for (let channel = 0; channel < 3; channel++) {
      expect(mesh.colors[channel]).toBeCloseTo(floor[channel] as number, 6);
      expect(mesh.colors[6 + channel]).toBeCloseTo(peak[channel] as number, 6);
    }
  });

  it("returns null when the grid carries no fitted vol at all", () => {
    expect(buildSurfaceMesh(flatGrid(3, 3, () => null))).toBeNull();
  });
});

describe("sliceAtExpiry", () => {
  it("cuts the real front-month smile and skips its gaps", () => {
    const slice = sliceAtExpiry(realGrid, 0);
    expect(slice).not.toBeNull();
    if (slice === null) return;

    expect(slice.expiration).toBe("2026-07-24");
    const quoted = (realGrid.iv[0] ?? []).filter((v) => v !== null).length;
    expect(slice.points.length).toBe(quoted);
    expect(slice.points.every((p) => Number.isFinite(p.iv) && p.iv > 0)).toBe(true);
  });

  it("keeps strikes rising with moneyness", () => {
    const slice = sliceAtExpiry(realGrid, 5);
    if (slice === null) throw new Error("no slice");
    for (let i = 1; i < slice.points.length; i++) {
      const previous = slice.points[i - 1] as { strike: number };
      const current = slice.points[i] as { strike: number };
      expect(current.strike).toBeGreaterThan(previous.strike);
    }
  });

  it("returns null for a row outside the grid", () => {
    expect(sliceAtExpiry(realGrid, 99)).toBeNull();
  });
});

describe("sliceAtMoneyness", () => {
  it("reads the term structure at the money", () => {
    const atm = realGrid.moneyness.findIndex((k) => k >= 0);
    const points = sliceAtMoneyness(realGrid, atm);
    expect(points.length).toBeGreaterThan(10);

    for (let i = 1; i < points.length; i++) {
      const previous = points[i - 1] as { years: number };
      const current = points[i] as { years: number };
      expect(current.years).toBeGreaterThan(previous.years);
    }
  });

  it("thins out in the deep wings, where only long-dated slices reach", () => {
    // the far wing is quoted by 7 of 18 expiries, at the money by all of them.
    // a column that returned all 18 everywhere would mean the fit was
    // extrapolating past where the market quoted.
    const wing = sliceAtMoneyness(realGrid, 0);
    const atm = sliceAtMoneyness(
      realGrid,
      realGrid.moneyness.findIndex((k) => k >= 0),
    );

    expect(wing.length).toBe(7);
    expect(atm.length).toBe(realGrid.years.length);
    expect(wing.every((p) => p.years > 0.2)).toBe(true);
  });

  it("returns nothing for a column outside the grid", () => {
    expect(sliceAtMoneyness(realGrid, 999).length).toBe(0);
  });
});

describe("stage placement", () => {
  it("puts the first and last expiry on the stage edges", () => {
    const bounds = surfaceBounds(realGrid);
    if (bounds === null) throw new Error("no bounds");
    expect(rowDepth(realGrid, 0, bounds)).toBeCloseTo(-STAGE.depth / 2, 12);
    expect(rowDepth(realGrid, realGrid.years.length - 1, bounds)).toBeCloseTo(STAGE.depth / 2, 12);
  });

  it("spaces expiries by sqrt of time so the crowded front gets real depth", () => {
    const bounds = surfaceBounds(realGrid);
    if (bounds === null) throw new Error("no bounds");

    // eleven of the eighteen expiries fall inside the first six months. spaced
    // linearly they share a fifth of the stage; by sqrt(T) they get near half.
    const withinSixMonths = realGrid.years.filter((y) => y <= 0.5).length;
    expect(withinSixMonths).toBe(11);

    const lastFront = withinSixMonths - 1;
    const depth = rowDepth(realGrid, lastFront, bounds) + STAGE.depth / 2;
    expect(depth / STAGE.depth).toBeGreaterThan(0.4);
  });

  it("keeps expiry depth strictly increasing", () => {
    const bounds = surfaceBounds(realGrid);
    if (bounds === null) throw new Error("no bounds");

    for (let row = 1; row < realGrid.years.length; row++) {
      expect(rowDepth(realGrid, row, bounds)).toBeGreaterThan(rowDepth(realGrid, row - 1, bounds));
    }
  });

  it("puts the moneyness extremes on the stage edges", () => {
    const bounds = surfaceBounds(realGrid);
    if (bounds === null) throw new Error("no bounds");
    expect(colOffset(realGrid, 0, bounds)).toBeCloseTo(-STAGE.width / 2, 12);
    expect(colOffset(realGrid, realGrid.moneyness.length - 1, bounds)).toBeCloseTo(
      STAGE.width / 2,
      12,
    );
  });
});

describe("morph", () => {
  it("only tweens grids of matching shape", () => {
    const a = buildSurfaceMesh(flatGrid(3, 4, () => 0.4));
    const b = buildSurfaceMesh(flatGrid(3, 4, () => 0.6));
    const c = buildSurfaceMesh(flatGrid(5, 4, () => 0.6));
    if (a === null || b === null || c === null) throw new Error("mesh did not build");

    expect(canMorph(a, b)).toBe(true);
    expect(canMorph(a, c)).toBe(false);
  });

  it("lands exactly on each end and halfway in between", () => {
    const from = new Float32Array([0, 0, 0, 2, 4, 6]);
    const to = new Float32Array([1, 1, 1, 4, 8, 12]);
    const out = new Float32Array(6);

    morphPositions(from, to, 0, out);
    expect([...out]).toEqual([...from]);

    morphPositions(from, to, 1, out);
    expect([...out]).toEqual([...to]);

    morphPositions(from, to, 0.5, out);
    expect([...out]).toEqual([0.5, 0.5, 0.5, 3, 6, 9]);
  });

  it("clamps a spring that overshoots past either end", () => {
    const from = new Float32Array([0]);
    const to = new Float32Array([10]);
    const out = new Float32Array(1);

    morphPositions(from, to, 1.4, out);
    expect(out[0]).toBe(10);
    morphPositions(from, to, -0.4, out);
    expect(out[0]).toBe(0);
  });
});
