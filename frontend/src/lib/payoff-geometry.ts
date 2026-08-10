import type { PayoffPoint } from "./strategy";

export interface Box {
  width: number;
  height: number;
  padLeft: number;
  padRight: number;
  padTop: number;
  padBottom: number;
}

export interface Scale {
  x: (spot: number) => number;
  y: (profit: number) => number;
  /** where profit 0 sits vertically, which is where the fill flips sign */
  zeroY: number;
  domain: { minSpot: number; maxSpot: number; minProfit: number; maxProfit: number };
}

/** a flat payoff would collapse the y domain to a point and divide by zero */
const MIN_SPAN = 1e-9;

export const buildScale = (points: PayoffPoint[], box: Box): Scale | null => {
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
  const span = maxProfit - minProfit;
  if (span < MIN_SPAN) return null;

  const innerWidth = box.width - box.padLeft - box.padRight;
  const innerHeight = box.height - box.padTop - box.padBottom;

  const x = (spot: number) => box.padLeft + ((spot - minSpot) / (maxSpot - minSpot)) * innerWidth;
  const y = (profit: number) => box.padTop + ((maxProfit - profit) / span) * innerHeight;

  return { x, y, zeroY: y(0), domain: { minSpot, maxSpot, minProfit, maxProfit } };
};

/** the payoff is piecewise linear, so straight segments are the honest curve -
    smoothing it would round off the kinks that are the whole point */
export const linePath = (points: PayoffPoint[], scale: Scale): string =>
  points
    .map(
      (point, i) =>
        `${i === 0 ? "M" : "L"}${scale.x(point.spot).toFixed(2)} ${scale.y(point.profit).toFixed(2)}`,
    )
    .join(" ");

/**
 * the profit and loss regions as separate closed paths, each clipped at zero so
 * the green fill never bleeds below the axis. splitting on the exact crossing
 * rather than per-sample keeps the boundary on the real breakeven.
 */
export const areaPaths = (
  points: PayoffPoint[],
  scale: Scale,
): { positive: string; negative: string } => {
  const positive: string[] = [];
  const negative: string[] = [];

  interface Run {
    sign: 1 | -1;
    parts: string[];
  }

  const zero = scale.zeroY.toFixed(2);
  const startRun = (sign: 1 | -1, x: number): Run => ({
    sign,
    parts: [`M${x.toFixed(2)} ${zero}`],
  });

  const endRun = (run: Run, x: number): void => {
    if (run.parts.length < 2) return;
    const path = `${run.parts.join(" ")} L${x.toFixed(2)} ${zero} Z`;
    if (run.sign === 1) positive.push(path);
    else negative.push(path);
  };

  let run: Run | null = null;

  for (let i = 0; i < points.length; i++) {
    const point = points[i] as PayoffPoint;
    const sign: 1 | -1 = point.profit >= 0 ? 1 : -1;
    const px = scale.x(point.spot);

    if (run === null) {
      run = startRun(sign, px);
    } else if (run.sign !== sign) {
      // cut at the exact zero crossing between this sample and the last, so the
      // two fills meet on the breakeven rather than overlapping by one sample
      const prev = points[i - 1] as PayoffPoint;
      const t = prev.profit / (prev.profit - point.profit);
      const crossX = scale.x(prev.spot + t * (point.spot - prev.spot));
      endRun(run, crossX);
      run = startRun(sign, crossX);
    }

    run.parts.push(`L${px.toFixed(2)} ${scale.y(point.profit).toFixed(2)}`);
  }

  if (run !== null) {
    endRun(run, scale.x((points[points.length - 1] as PayoffPoint).spot));
  }

  return { positive: positive.join(" "), negative: negative.join(" ") };
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

/** readable spot ticks: round numbers inside the window, never one per sample */
export const spotTicks = (minSpot: number, maxSpot: number, count = 5): number[] => {
  const span = maxSpot - minSpot;
  if (span <= 0) return [];
  const raw = span / count;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const normalized = raw / magnitude;
  const stepFactor = normalized >= 5 ? 10 : normalized >= 2 ? 5 : normalized >= 1 ? 2 : 1;
  const step = stepFactor * magnitude;

  const ticks: number[] = [];
  for (let value = Math.ceil(minSpot / step) * step; value <= maxSpot; value += step) {
    ticks.push(Number(value.toFixed(6)));
  }
  return ticks;
};
