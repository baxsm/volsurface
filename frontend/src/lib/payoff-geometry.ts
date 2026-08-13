import type { PayoffPoint } from "./strategy";

export interface Domain {
  minSpot: number;
  maxSpot: number;
  minProfit: number;
  maxProfit: number;
}

/** a flat payoff would collapse the y domain to a point and divide by zero */
const MIN_SPAN = 1e-9;

/**
 * the value ranges the axes have to cover. the pixel mapping is visx's job now,
 * but which numbers must stay in frame is a property of the payoff, not of the
 * renderer, so it is decided here.
 */
export const payoffDomain = (points: PayoffPoint[]): Domain | null => {
  if (points.length < 2) return null;

  const spots = points.map((p) => p.spot);
  const profits = points.map((p) => p.profit);

  const minSpot = Math.min(...spots);
  const maxSpot = Math.max(...spots);
  const rawMin = Math.min(...profits);
  const rawMax = Math.max(...profits);

  if (!Number.isFinite(minSpot) || !Number.isFinite(rawMin)) return null;
  if (maxSpot - minSpot < MIN_SPAN) return null;

  // zero always stays in frame: a payoff read against a missing zero line says
  // nothing about whether the position makes money
  const headroom = Math.max((rawMax - rawMin) * 0.12, Math.abs(rawMax || rawMin || 1) * 0.1);
  const minProfit = Math.min(rawMin - headroom, 0);
  const maxProfit = Math.max(rawMax + headroom, 0);
  if (maxProfit - minProfit < MIN_SPAN) return null;

  return { minSpot, maxSpot, minProfit, maxProfit };
};

/**
 * resamples a payoff onto a fixed spot grid. tweening two curves needs both to
 * have the same vertex count, and a leg change alters both the sample count and
 * the window, so the spring interpolates over a shared grid instead.
 */
export const resample = (points: PayoffPoint[], grid: number[]): PayoffPoint[] => {
  if (points.length === 0) return grid.map((spot) => ({ spot, profit: 0 }));

  return grid.map((spot) => {
    const first = points[0] as PayoffPoint;
    const last = points[points.length - 1] as PayoffPoint;
    if (spot <= first.spot) return { spot, profit: first.profit };
    if (spot >= last.spot) return { spot, profit: last.profit };

    // binary search: the grid is far denser than a linear scan wants to be
    let lo = 0;
    let hi = points.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if ((points[mid] as PayoffPoint).spot <= spot) lo = mid;
      else hi = mid;
    }

    const a = points[lo] as PayoffPoint;
    const b = points[hi] as PayoffPoint;
    const width = b.spot - a.spot;
    if (width <= 0) return { spot, profit: a.profit };
    const t = (spot - a.spot) / width;
    return { spot, profit: a.profit + t * (b.profit - a.profit) };
  });
};

export const gridOver = (min: number, max: number, steps: number): number[] =>
  Array.from({ length: steps + 1 }, (_, i) => min + ((max - min) * i) / steps);

/**
 * inserts an exact sample on every zero crossing.
 *
 * the profit and loss fills are split by a `defined` predicate, which can only
 * include or exclude whole samples. without a vertex sitting exactly on the
 * breakeven the two fills would meet at whichever grid point happened to fall
 * nearest it, leaving a visible notch. adding the crossing to the data puts the
 * boundary on the real breakeven instead.
 */
export const withCrossings = (points: PayoffPoint[]): PayoffPoint[] => {
  if (points.length < 2) return points;

  const out: PayoffPoint[] = [];
  for (let i = 0; i < points.length; i++) {
    const point = points[i] as PayoffPoint;
    out.push(point);

    const next = points[i + 1];
    if (next === undefined) continue;
    if (point.profit === 0 || next.profit === 0) continue;
    if (point.profit > 0 === next.profit > 0) continue;

    const t = point.profit / (point.profit - next.profit);
    if (!Number.isFinite(t)) continue;
    out.push({ spot: point.spot + t * (next.spot - point.spot), profit: 0 });
  }

  return out;
};
