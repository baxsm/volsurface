import type { SviParams, SviQuote, SviSliceFit } from "../types";

/**
 * raw SVI total variance. w(k) = a + b*(rho*(k-m) + sqrt((k-m)^2 + sigma^2))
 * k is log-moneyness ln(K/F), w is total variance IV^2 * T.
 */
export const sviTotalVariance = (params: SviParams, k: number): number => {
  const { a, b, rho, m, sigma } = params;
  const km = k - m;
  return a + b * (rho * km + Math.sqrt(km * km + sigma * sigma));
};

/** implied vol implied by a slice at log-moneyness k. null when total variance is non-positive. */
export const sviImpliedVol = (params: SviParams, k: number, t: number): number | null => {
  if (t <= 0) return null;
  const w = sviTotalVariance(params, k);
  if (w <= 0) return null;
  return Math.sqrt(w / t);
};

// Gatheral-Jacquier butterfly (single-slice) no-arb conditions. these bound the
// wing slope and keep the risk-neutral density non-negative. checked during the
// fit, not after, so a fitted slice is arb-free by construction.
const WING_BOUND = 2;

// m only shifts the smile horizontally, so it cannot violate these conditions
export const butterflyViolations = ({ a, b, rho, sigma }: SviParams): string[] => {
  const bad: string[] = [];
  if (b < 0) bad.push("b must be non-negative");
  if (sigma <= 0) bad.push("sigma must be positive");
  if (rho <= -1 || rho >= 1) bad.push("rho must lie in (-1, 1)");
  // a slice can satisfy the shape checks below while still going negative, so
  // guard the remaining conditions only once the params are structurally sane
  if (bad.length > 0) return bad;

  if (b * (1 + Math.abs(rho)) > WING_BOUND + 1e-9) {
    bad.push("wing slope b*(1+|rho|) exceeds 2");
  }
  if (a + b * sigma * Math.sqrt(1 - rho * rho) < -1e-9) {
    bad.push("a + b*sigma*sqrt(1-rho^2) is negative");
  }
  if (sigma < (b / 2) * (1 + Math.abs(rho)) * Math.sqrt(1 - rho * rho) - 1e-9) {
    bad.push("sigma below the vertex bound");
  }
  return bad;
};

export const isButterflyArbFree = (params: SviParams): boolean =>
  butterflyViolations(params).length === 0;

/**
 * project params back into the arb-free region. the optimiser walks freely and
 * every candidate is clamped through here, so no evaluated point is ever
 * outside the constraint set.
 */
export const projectToArbFree = (params: SviParams): SviParams => {
  const m = params.m;
  let { a, b, rho, sigma } = params;

  rho = Math.min(Math.max(rho, -0.999), 0.999);
  b = Math.max(b, 0);
  sigma = Math.max(sigma, 1e-6);

  // wing bound caps b given rho
  const maxB = WING_BOUND / (1 + Math.abs(rho));
  b = Math.min(b, maxB);

  // vertex bound raises sigma given b and rho
  const minSigma = (b / 2) * (1 + Math.abs(rho)) * Math.sqrt(1 - rho * rho);
  sigma = Math.max(sigma, minSigma);

  // positivity raises a given the rest
  const minA = -b * sigma * Math.sqrt(1 - rho * rho);
  a = Math.max(a, minA);

  return { a, b, rho, m, sigma };
};

const residualSumSquares = (params: SviParams, quotes: SviQuote[]): number => {
  let total = 0;
  for (const quote of quotes) {
    const diff = sviTotalVariance(params, quote.k) - quote.w;
    total += quote.weight * diff * diff;
  }
  return total;
};

/**
 * seed from the quote cloud: level at the minimum, width from the k spread,
 * skew from the slope across the wings. a decent seed matters more than the
 * optimiser here because the objective has flat valleys in (m, sigma).
 */
const seedParams = (quotes: SviQuote[]): SviParams => {
  const ks = quotes.map((q) => q.k);
  const ws = quotes.map((q) => q.w);
  const minW = Math.min(...ws);
  const kAtMin = ks[ws.indexOf(minW)] ?? 0;
  const spread = Math.max(...ks) - Math.min(...ks);

  // slope difference between the wings gives the sign and rough size of skew
  const mid = kAtMin;
  const left = quotes.filter((q) => q.k < mid);
  const right = quotes.filter((q) => q.k > mid);
  const avg = (xs: number[]): number =>
    xs.length === 0 ? 0 : xs.reduce((s, x) => s + x, 0) / xs.length;
  const leftSlope =
    left.length > 0
      ? (avg(left.map((q) => q.w)) - minW) / Math.max(mid - Math.min(...ks), 1e-6)
      : 0;
  const rightSlope =
    right.length > 0
      ? (avg(right.map((q) => q.w)) - minW) / Math.max(Math.max(...ks) - mid, 1e-6)
      : 0;

  const b = Math.max((leftSlope + rightSlope) / 2, 1e-3);
  const denom = leftSlope + rightSlope;
  const rho =
    denom > 1e-12 ? Math.min(Math.max((rightSlope - leftSlope) / denom, -0.9), 0.9) : -0.3;

  return projectToArbFree({
    a: Math.max(minW * 0.9, 1e-8),
    b,
    rho,
    m: mid,
    sigma: Math.max(spread / 4, 1e-3),
  });
};

const PARAM_KEYS = ["a", "b", "rho", "m", "sigma"] as const;

/**
 * Nelder-Mead over the 5 SVI params, with every vertex projected into the
 * arb-free region before it is scored. deliberately derivative-free: the
 * projection makes the objective non-smooth, which breaks gradient methods.
 */
const nelderMead = (
  seed: SviParams,
  quotes: SviQuote[],
  maxIterations: number,
): { params: SviParams; iterations: number } => {
  const toVector = (p: SviParams): number[] => PARAM_KEYS.map((key) => p[key]);
  const toParams = (v: number[]): SviParams =>
    projectToArbFree({
      a: v[0] ?? 0,
      b: v[1] ?? 0,
      rho: v[2] ?? 0,
      m: v[3] ?? 0,
      sigma: v[4] ?? 1e-6,
    });

  const score = (v: number[]): number => residualSumSquares(toParams(v), quotes);

  // initial simplex: perturb each axis by a scale that suits its own magnitude
  const base = toVector(seed);
  const steps = [
    Math.max(Math.abs(base[0] ?? 0) * 0.5, 1e-3),
    Math.max(Math.abs(base[1] ?? 0) * 0.5, 1e-2),
    0.2,
    Math.max(Math.abs(base[3] ?? 0) * 0.5, 5e-2),
    Math.max(Math.abs(base[4] ?? 0) * 0.5, 1e-2),
  ];

  let simplex = [base, ...steps.map((step, i) => base.map((x, j) => (i === j ? x + step : x)))];
  let scores = simplex.map(score);
  let iterations = 0;

  const centroidExcludingWorst = (points: number[][]): number[] => {
    const dim = PARAM_KEYS.length;
    const c = new Array<number>(dim).fill(0);
    for (let i = 0; i < points.length - 1; i++) {
      const p = points[i] ?? [];
      for (let j = 0; j < dim; j++) c[j] = (c[j] ?? 0) + (p[j] ?? 0);
    }
    return c.map((x) => x / (points.length - 1));
  };

  for (; iterations < maxIterations; iterations++) {
    const order = scores.map((s, i) => [s, i] as const).sort((x, y) => x[0] - y[0]);
    simplex = order.map(([, i]) => simplex[i] ?? []);
    scores = order.map(([s]) => s);

    const best = scores[0] ?? 0;
    const worst = scores[scores.length - 1] ?? 0;
    if (Math.abs(worst - best) <= 1e-14 * (Math.abs(best) + 1e-14)) break;

    const centroid = centroidExcludingWorst(simplex);
    const worstPoint = simplex[simplex.length - 1] ?? [];

    const reflect = centroid.map((c, i) => c + (c - (worstPoint[i] ?? 0)));
    const reflectScore = score(reflect);

    if (reflectScore < best) {
      const expand = centroid.map((c, i) => c + 2 * (c - (worstPoint[i] ?? 0)));
      const expandScore = score(expand);
      simplex[simplex.length - 1] = expandScore < reflectScore ? expand : reflect;
      scores[scores.length - 1] = Math.min(expandScore, reflectScore);
      continue;
    }

    if (reflectScore < (scores[scores.length - 2] ?? Number.POSITIVE_INFINITY)) {
      simplex[simplex.length - 1] = reflect;
      scores[scores.length - 1] = reflectScore;
      continue;
    }

    const contract = centroid.map((c, i) => c + 0.5 * ((worstPoint[i] ?? 0) - c));
    const contractScore = score(contract);
    if (contractScore < worst) {
      simplex[simplex.length - 1] = contract;
      scores[scores.length - 1] = contractScore;
      continue;
    }

    // shrink toward the best vertex
    const bestPoint = simplex[0] ?? [];
    simplex = simplex.map((p, i) =>
      i === 0 ? p : p.map((x, j) => (bestPoint[j] ?? 0) + 0.5 * (x - (bestPoint[j] ?? 0))),
    );
    scores = simplex.map(score);
  }

  const bestIndex = scores.indexOf(Math.min(...scores));
  return { params: toParams(simplex[bestIndex] ?? base), iterations };
};

export interface SviFitOptions {
  /** optimiser iteration cap. defaults to 2000 */
  maxIterations?: number;
}

/** minimum quotes needed before a 5-parameter fit is meaningful rather than interpolation */
export const MIN_QUOTES_PER_SLICE = 5;

/**
 * fit one expiry slice. returns null when the slice has too few usable quotes -
 * fitting 5 params to 4 points would produce a curve that renders convincingly
 * and means nothing.
 */
export const fitSviSlice = (
  expiration: string,
  t: number,
  quotes: SviQuote[],
  options: SviFitOptions = {},
): SviSliceFit | null => {
  const usable = quotes.filter(
    (q) => Number.isFinite(q.k) && Number.isFinite(q.w) && q.w > 0 && q.weight > 0,
  );
  if (usable.length < MIN_QUOTES_PER_SLICE || t <= 0) return null;

  const seed = seedParams(usable);
  const { params, iterations } = nelderMead(seed, usable, options.maxIterations ?? 2000);

  const rss = residualSumSquares(params, usable);
  const totalWeight = usable.reduce((s, q) => s + q.weight, 0);
  const rmse = Math.sqrt(rss / totalWeight);

  const ks = usable.map((q) => q.k);

  return {
    expiration,
    t,
    params,
    quoteCount: usable.length,
    rmse,
    iterations,
    butterflyArbFree: isButterflyArbFree(params),
    kMin: Math.min(...ks),
    kMax: Math.max(...ks),
  };
};
