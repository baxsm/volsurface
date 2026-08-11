import type { SurfaceGrid } from "./types";

/**
 * the mesh lives in a fixed unit box rather than in strike/year/vol units. the
 * three axes span wildly different magnitudes (strikes ~117-388, years 0.01-2.4,
 * vol 0.45-0.87), so plotting them raw would render a sliver. normalising keeps
 * the camera framing independent of the symbol.
 */
export const STAGE = { width: 2.4, depth: 2.4, height: 0.9 } as const;

export interface SurfaceBounds {
  minMoneyness: number;
  maxMoneyness: number;
  minYears: number;
  maxYears: number;
  minIv: number;
  maxIv: number;
  /** every fitted vol on the grid, ascending. height and colour read positions
      out of this rather than out of the raw range - see ivHeight. */
  sortedIv: readonly number[];
}

/** a degenerate axis would divide by zero when normalising */
const MIN_SPAN = 1e-9;

export const surfaceBounds = (grid: SurfaceGrid): SurfaceBounds | null => {
  const { moneyness, years } = grid;
  if (moneyness.length < 2 || years.length < 2) return null;

  const sortedIv: number[] = [];
  for (const row of grid.iv) {
    for (const value of row) {
      if (value === null || !Number.isFinite(value)) continue;
      sortedIv.push(value);
    }
  }
  sortedIv.sort((a, b) => a - b);

  if (sortedIv.length === 0) return null;
  const minIv = sortedIv[0] as number;
  const maxIv = sortedIv[sortedIv.length - 1] as number;

  const minMoneyness = Math.min(...moneyness);
  const maxMoneyness = Math.max(...moneyness);
  const minYears = Math.min(...years);
  const maxYears = Math.max(...years);

  if (maxMoneyness - minMoneyness < MIN_SPAN) return null;
  if (maxYears - minYears < MIN_SPAN) return null;

  // a perfectly flat surface is legitimate, so an empty vol span collapses to a
  // flat sheet at mid height instead of failing
  return { minMoneyness, maxMoneyness, minYears, maxYears, minIv, maxIv, sortedIv };
};

/**
 * height and colour use the vol's position in the sorted fitted values, not its
 * position in the raw range.
 *
 * a real chain is nearly flat except at the front. on the IBM fit the four-day
 * expiry reaches 87% while the middle half of the whole grid sits inside
 * 46.9-51.2% - a 4% band stretched across a 43% range. mapped linearly the
 * median vol lands at 10% of the height; even under a square root it only
 * reaches 31%, and 56% of the grid still falls in the bottom third of the ramp.
 * both render as one pale sheet with every feature crushed into the far corner,
 * which is what the surface actually looked like before this changed.
 *
 * ranking puts the median at 50% and gives the middle half of the data half the
 * range instead of a sixth. it stays strictly monotonic and clips nothing, so
 * every "this vol is higher than that one" the surface shows is still true -
 * what it gives up is linearity, so equal heights no longer mean equal vol
 * steps. that is why the legend marks a vol read back out of the data rather
 * than an evenly spaced scale.
 */
export const ivHeight = (iv: number, bounds: SurfaceBounds): number => {
  const values = bounds.sortedIv;
  if (values.length < 2) return 0.5;
  if (bounds.maxIv - bounds.minIv < MIN_SPAN) return 0.5;

  // a run of equal vols sits at the centre of the band it occupies, so ties do
  // not smear one vol across a stretch of the ramp
  const rankOf = (value: number) => (lowerBound(values, value) + upperBound(values, value) - 1) / 2;

  // then rescale onto the ranks the extremes actually landed on. with heavy
  // ties those centres are well inside 0..1 - two distinct vols would sit at
  // 0.15 and 0.75 - and the floor and peak have to reach the ends of the ramp.
  const first = rankOf(bounds.minIv);
  const last = rankOf(bounds.maxIv);
  const span = last - first;
  if (span < MIN_SPAN) return 0.5;

  const t = (rankOf(iv) - first) / span;
  return t < 0 ? 0 : t > 1 ? 1 : t;
};

/** first index whose value is >= target */
const lowerBound = (values: readonly number[], target: number): number => {
  let lo = 0;
  let hi = values.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if ((values[mid] as number) < target) lo = mid + 1;
    else hi = mid;
  }
  return lo;
};

/** first index whose value is > target */
const upperBound = (values: readonly number[], target: number): number => {
  let lo = 0;
  let hi = values.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if ((values[mid] as number) <= target) lo = mid + 1;
    else hi = mid;
  }
  return lo;
};

/**
 * where a vol sits on the colour ramp, which is not where it sits in height.
 *
 * height is pure rank because the geometry needs the spread - that is what
 * stopped the surface rendering as a flat sheet. colour cannot use rank alone:
 * ranking forces a quarter of the vertices into each quarter of the ramp, so a
 * chain whose vols are genuinely bunched still gets painted across the full
 * range and the mesh washes out to the pale end. blending rank halfway back
 * toward the true position keeps the deep blue on the low vols and still lifts
 * the bunched middle off the floor of the ramp.
 */
export const ivColorPosition = (iv: number, bounds: SurfaceBounds): number => {
  const span = bounds.maxIv - bounds.minIv;
  if (span < MIN_SPAN) return 0.5;
  const linear = (iv - bounds.minIv) / span;
  const clamped = linear < 0 ? 0 : linear > 1 ? 1 : linear;
  return 0.5 * ivHeight(iv, bounds) + 0.5 * Math.sqrt(clamped);
};

/**
 * the vol sitting closest to a given height, so a legend tick can be labelled
 * with a value that is really there. inverts ivHeight by scanning the fitted
 * vols rather than by algebra, so the two can never drift apart.
 */
export const ivAtHeight = (height: number, bounds: SurfaceBounds): number => {
  const values = bounds.sortedIv;
  if (values.length === 0) return bounds.minIv;

  let best = values[0] as number;
  let bestGap = Number.POSITIVE_INFINITY;
  for (const value of values) {
    const gap = Math.abs(ivHeight(value, bounds) - height);
    if (gap < bestGap) {
      bestGap = gap;
      best = value;
    }
  }
  return best;
};

const norm = (value: number, min: number, max: number): number => {
  const span = max - min;
  if (span < MIN_SPAN) return 0.5;
  return (value - min) / span;
};

/**
 * expiries are spaced by the square root of time, not by time.
 *
 * a real chain is dense at the front and sparse at the back: on the IBM fit,
 * eleven of eighteen expiries fall inside the first six months, which is a fifth
 * of the calendar span. spacing them linearly crushes every one of them into a
 * fifth of the depth and hands the rest of the stage to four nearly identical
 * long-dated slices, so the surface reads as a flat plane with the interesting
 * part squashed against one edge. sqrt(T) gives that front cluster 45% instead.
 *
 * this is also how vol term structure is conventionally read - variance grows
 * with T, so vol moves with sqrt(T) - and it stays monotonic, so the ordering of
 * the expiries is unchanged.
 */
const termPosition = (years: number, minYears: number, maxYears: number): number => {
  const lo = Math.sqrt(Math.max(minYears, 0));
  const hi = Math.sqrt(Math.max(maxYears, 0));
  return norm(Math.sqrt(Math.max(years, 0)), lo, hi);
};

/**
 * the single perceptual ramp from ui.md: deep blue through teal to a pale warm
 * peak. explicitly NOT rainbow - a hue cycle invents banding that reads as
 * structure the surface does not have.
 */
export const RAMP: readonly (readonly [number, number, number])[] = [
  [0.071, 0.137, 0.227],
  [0.181, 0.541, 0.651],
  [0.435, 0.914, 0.784],
  [0.949, 0.914, 0.627],
];

/** sample the ramp at t in [0,1], linear between the four stops */
export const rampColor = (t: number): [number, number, number] => {
  const clamped = t < 0 ? 0 : t > 1 ? 1 : Number.isFinite(t) ? t : 0;
  const last = RAMP.length - 1;
  const scaled = clamped * last;
  const index = Math.min(Math.floor(scaled), last - 1);
  const frac = scaled - index;

  const from = RAMP[index] as readonly [number, number, number];
  const to = RAMP[index + 1] as readonly [number, number, number];

  return [
    from[0] + (to[0] - from[0]) * frac,
    from[1] + (to[1] - from[1]) * frac,
    from[2] + (to[2] - from[2]) * frac,
  ];
};

export interface SurfaceMesh {
  positions: Float32Array;
  colors: Float32Array;
  /** triangle indices. quads touching a gap are omitted, not zero-filled */
  indices: Uint32Array;
  /** index-aligned with the vertex rows/cols, false where the slice had no quote */
  filled: boolean[];
  rows: number;
  cols: number;
  bounds: SurfaceBounds;
  /** wireframe segment pairs over the same vertices */
  wireIndices: Uint32Array;
  /**
   * the outline where the fitted region ends. each expiry was quoted over a
   * different moneyness range, so the mesh edge is a real staircase rather than
   * a clean rectangle. tracing it makes that boundary read as the edge of the
   * data instead of as torn geometry.
   */
  edgeIndices: Uint32Array;
}

const vertexIndex = (row: number, col: number, cols: number): number => row * cols + col;

/**
 * build the mesh in one pass.
 *
 * gaps are the whole difficulty here. 25% of the fitted grid is null because a
 * slice is only sampled over the moneyness its quotes actually covered. a null
 * cannot become a vertex at height 0 - that would draw a cliff to the floor
 * where the market simply did not quote. so gap vertices are parked at the
 * surface's own mid height to keep the buffer rectangular (three needs a fixed
 * stride) and every quad touching one is left out of the index buffer, which is
 * what actually decides what gets drawn.
 */
export const buildSurfaceMesh = (grid: SurfaceGrid): SurfaceMesh | null => {
  const bounds = surfaceBounds(grid);
  if (bounds === null) return null;

  const rows = grid.years.length;
  const cols = grid.moneyness.length;
  if (grid.iv.length !== rows) return null;

  const positions = new Float32Array(rows * cols * 3);
  const colors = new Float32Array(rows * cols * 3);
  const filled: boolean[] = new Array(rows * cols).fill(false);

  for (let row = 0; row < rows; row++) {
    const ivRow = grid.iv[row];
    const year = grid.years[row];
    if (ivRow === undefined || year === undefined) return null;

    const z = (termPosition(year, bounds.minYears, bounds.maxYears) - 0.5) * STAGE.depth;

    for (let col = 0; col < cols; col++) {
      const k = grid.moneyness[col];
      if (k === undefined) return null;

      const iv = ivRow[col] ?? null;
      const present = iv !== null && Number.isFinite(iv);
      const height = present ? ivHeight(iv, bounds) : 0.5;

      const i = vertexIndex(row, col, cols);
      positions[i * 3] = (norm(k, bounds.minMoneyness, bounds.maxMoneyness) - 0.5) * STAGE.width;
      positions[i * 3 + 1] = height * STAGE.height;
      positions[i * 3 + 2] = z;

      const [r, g, b] = rampColor(present ? ivColorPosition(iv, bounds) : 0.5);
      colors[i * 3] = r;
      colors[i * 3 + 1] = g;
      colors[i * 3 + 2] = b;
      filled[i] = present;
    }
  }

  const indices: number[] = [];
  const wire: number[] = [];
  // an edge drawn by exactly one quad is on the boundary; one shared by two is
  // interior. counting them is what separates the outline from the wireframe.
  const edgeUse = new Map<string, [number, number, number]>();

  const noteEdge = (from: number, to: number) => {
    const key = from < to ? `${from}:${to}` : `${to}:${from}`;
    const existing = edgeUse.get(key);
    if (existing === undefined) edgeUse.set(key, [from, to, 1]);
    else existing[2] += 1;
  };

  for (let row = 0; row < rows - 1; row++) {
    for (let col = 0; col < cols - 1; col++) {
      const a = vertexIndex(row, col, cols);
      const b = vertexIndex(row, col + 1, cols);
      const c = vertexIndex(row + 1, col + 1, cols);
      const d = vertexIndex(row + 1, col, cols);

      if (!(filled[a] === true && filled[b] === true && filled[c] === true && filled[d] === true)) {
        continue;
      }

      indices.push(a, b, d, b, c, d);
      wire.push(a, b, a, d);

      noteEdge(a, b);
      noteEdge(b, c);
      noteEdge(c, d);
      noteEdge(d, a);
    }
  }

  const edges: number[] = [];
  for (const [from, to, count] of edgeUse.values()) {
    if (count === 1) edges.push(from, to);
  }

  // the far edges never open a quad, so their wire segments are added here or
  // the mesh would read as unbounded on two sides
  for (let row = 0; row < rows - 1; row++) {
    const a = vertexIndex(row, cols - 1, cols);
    const b = vertexIndex(row + 1, cols - 1, cols);
    if (filled[a] === true && filled[b] === true) wire.push(a, b);
  }
  for (let col = 0; col < cols - 1; col++) {
    const a = vertexIndex(rows - 1, col, cols);
    const b = vertexIndex(rows - 1, col + 1, cols);
    if (filled[a] === true && filled[b] === true) wire.push(a, b);
  }

  return {
    positions,
    colors,
    indices: new Uint32Array(indices),
    wireIndices: new Uint32Array(wire),
    edgeIndices: new Uint32Array(edges),
    filled,
    rows,
    cols,
    bounds,
  };
};

export interface SlicePoint {
  moneyness: number;
  strike: number;
  iv: number;
}

export interface SmileSlice {
  expiration: string;
  years: number;
  points: SlicePoint[];
}

/**
 * the 2D smile at one expiry. this is the cross-section the slice plane cuts,
 * read straight off the fitted grid rather than re-sampled, so the curve in the
 * readout is the same data the mesh is built from.
 */
export const sliceAtExpiry = (grid: SurfaceGrid, rowIndex: number): SmileSlice | null => {
  const expiration = grid.expiries[rowIndex];
  const years = grid.years[rowIndex];
  const ivRow = grid.iv[rowIndex];
  const strikeRow = grid.strikes[rowIndex];
  if (expiration === undefined || years === undefined) return null;
  if (ivRow === undefined || strikeRow === undefined) return null;

  const points: SlicePoint[] = [];
  for (let col = 0; col < ivRow.length; col++) {
    const iv = ivRow[col];
    const moneyness = grid.moneyness[col];
    const strike = strikeRow[col];
    if (iv === null || iv === undefined || !Number.isFinite(iv)) continue;
    if (moneyness === undefined || strike === undefined) continue;
    points.push({ moneyness, strike, iv });
  }

  if (points.length === 0) return null;
  return { expiration, years, points };
};

/**
 * the term structure at one moneyness column: how vol at a fixed moneyness
 * changes with maturity. the other way to cut the same surface.
 */
export interface TermPoint {
  expiration: string;
  years: number;
  iv: number;
}

export const sliceAtMoneyness = (grid: SurfaceGrid, colIndex: number): TermPoint[] => {
  const points: TermPoint[] = [];

  for (let row = 0; row < grid.iv.length; row++) {
    const iv = grid.iv[row]?.[colIndex];
    const expiration = grid.expiries[row];
    const years = grid.years[row];
    if (iv === null || iv === undefined || !Number.isFinite(iv)) continue;
    if (expiration === undefined || years === undefined) continue;
    points.push({ expiration, years, iv });
  }

  return points;
};

/** stage z for an expiry row, so the slice plane lands exactly on the mesh row */
export const rowDepth = (grid: SurfaceGrid, rowIndex: number, bounds: SurfaceBounds): number => {
  const year = grid.years[rowIndex];
  if (year === undefined) return -STAGE.depth / 2;
  return (termPosition(year, bounds.minYears, bounds.maxYears) - 0.5) * STAGE.depth;
};

/** stage x for a moneyness column */
export const colOffset = (grid: SurfaceGrid, colIndex: number, bounds: SurfaceBounds): number => {
  const k = grid.moneyness[colIndex];
  if (k === undefined) return -STAGE.width / 2;
  return (norm(k, bounds.minMoneyness, bounds.maxMoneyness) - 0.5) * STAGE.width;
};

/**
 * tween two meshes for the snapshot scrub. grids from different dates can carry
 * different expiry counts, so only a matching shape can be interpolated; the
 * caller falls back to a straight swap when the shapes differ.
 */
export const canMorph = (from: SurfaceMesh, to: SurfaceMesh): boolean =>
  from.rows === to.rows && from.cols === to.cols;

export const morphPositions = (
  from: Float32Array,
  to: Float32Array,
  t: number,
  out: Float32Array,
): void => {
  const clamped = t < 0 ? 0 : t > 1 ? 1 : t;
  for (let i = 0; i < out.length; i++) {
    const a = from[i] ?? 0;
    const b = to[i] ?? 0;
    out[i] = a + (b - a) * clamped;
  }
};
