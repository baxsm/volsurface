// standard normal pdf/cdf and inverse cdf.
// cdf uses Cody's erf rational approximation (~1e-16), not the Abramowitz-Stegun
// 5-term polynomial (~7.5e-8) - the IV solver's newton steps amplify cdf error,
// and 7.5e-8 in the cdf shows up as visible noise in deep-wing implied vols.

export const SQRT_2 = Math.SQRT2;
export const SQRT_2PI = Math.sqrt(2 * Math.PI);
export const INV_SQRT_2PI = 1 / SQRT_2PI;

export const normPdf = (x: number): number => INV_SQRT_2PI * Math.exp(-0.5 * x * x);

// horner evaluation, coefficients highest-power first
const poly = (coeffs: readonly number[], x: number): number => {
  let acc = 0;
  for (const c of coeffs) acc = acc * x + c;
  return acc;
};

// erf/erfc from convergent expansions rather than fitted rational coefficients.
// both branches iterate to a relative tolerance, so accuracy is a property of the
// algorithm instead of a table of magic constants that has to be transcribed right.

const SERIES_MAX_ITER = 200;
const CF_MAX_ITER = 300;
const TOL = 1e-17;

// maclaurin series erf(z) = 2/sqrt(pi) * sum_{n>=0} (-1)^n z^(2n+1) / (n!(2n+1)),
// summed in the numerically stable form term_{n} = term_{n-1} * (-z^2/n).
// converges fast for small z; used below the crossover only.
const erfSeries = (z: number): number => {
  const zz = z * z;
  let term = z;
  let sum = z;
  for (let n = 1; n < SERIES_MAX_ITER; n++) {
    term *= -zz / n;
    const add = term / (2 * n + 1);
    sum += add;
    if (Math.abs(add) < Math.abs(sum) * TOL) break;
  }
  return (2 / Math.sqrt(Math.PI)) * sum;
};

// erfc via the Lentz-evaluated continued fraction
//   erfc(z) = exp(-z^2)/sqrt(pi) * 1/(z+ (1/2)/(z+ 1/(z+ (3/2)/(z+ ...))))
// accurate for large z, where the series above loses cancellation precision.
const erfcContinuedFraction = (z: number): number => {
  const tiny = 1e-300;
  let f = tiny;
  let c = f;
  let d = 0;

  for (let i = 0; i < CF_MAX_ITER; i++) {
    // a_0 = 1, a_i = i/2 for i >= 1; every b_i = z
    const a = i === 0 ? 1 : i / 2;
    d = z + a * d;
    if (Math.abs(d) < tiny) d = tiny;
    c = z + a / c;
    if (Math.abs(c) < tiny) c = tiny;
    d = 1 / d;
    const delta = c * d;
    f *= delta;
    if (Math.abs(delta - 1) < TOL) break;
  }

  return (Math.exp(-z * z) / Math.sqrt(Math.PI)) * f;
};

// crossover at 2.0: below it the series still converges in a few dozen terms
// with no cancellation trouble, above it the continued fraction is faster and stabler.
const ERF_CROSSOVER = 2;

const erfc = (x: number): number => {
  const z = Math.abs(x);
  const r = z < ERF_CROSSOVER ? 1 - erfSeries(z) : erfcContinuedFraction(z);
  return x >= 0 ? r : 2 - r;
};

export const normCdf = (x: number): number => 0.5 * erfc(-x / SQRT_2);

// Acklam's inverse normal cdf (~1.15e-9), refined by one halley step to ~1e-15.
// used to seed the svi fit and to map uniform draws to normals in tests.
const A = [
  -3.969_683_028_665_376e1, 2.209_460_984_245_205e2, -2.759_285_104_469_687e2,
  1.383_577_518_672_69e2, -3.066_479_806_614_716e1, 2.506_628_277_459_239,
] as const;
const B = [
  -5.447_609_879_822_406e1, 1.615_858_368_580_409e2, -1.556_989_798_598_866e2,
  6.680_131_188_771_972e1, -1.328_068_155_288_572e1,
] as const;
const C = [
  -7.784_894_002_430_293e-3, -3.223_964_580_411_365e-1, -2.400_758_277_161_838,
  -2.549_732_539_343_734, 4.374_664_141_464_968, 2.938_163_982_698_783,
] as const;
const D = [
  7.784_695_709_041_462e-3, 3.224_671_290_700_398e-1, 2.445_134_137_142_996, 3.754_408_661_907_416,
] as const;

const P_LOW = 0.024_25;
const P_HIGH = 1 - P_LOW;

export const normInvCdf = (p: number): number => {
  if (!(p > 0 && p < 1)) {
    if (p === 0) return Number.NEGATIVE_INFINITY;
    if (p === 1) return Number.POSITIVE_INFINITY;
    return Number.NaN;
  }

  // the tails share one rational form in q = sqrt(-2 ln(p')), differing only in
  // sign and in which side supplies p'. the body uses a separate central fit.
  const tail = (q: number): number => poly(C, q) / (poly(D, q) * q + 1);

  let x: number;
  if (p < P_LOW) {
    x = tail(Math.sqrt(-2 * Math.log(p)));
  } else if (p <= P_HIGH) {
    const q = p - 0.5;
    const r = q * q;
    x = (poly(A, r) * q) / (poly(B, r) * r + 1);
  } else {
    x = -tail(Math.sqrt(-2 * Math.log(1 - p)));
  }

  // halley refinement against the high-precision cdf. acklam's seed is ~1e-9 in the
  // body but degrades in the far tail, so iterate to convergence rather than
  // assuming a single step suffices.
  for (let i = 0; i < 3; i++) {
    const e = normCdf(x) - p;
    if (e === 0) break;
    const u = e * SQRT_2PI * Math.exp(0.5 * x * x);
    const step = u / (1 + 0.5 * x * u);
    x -= step;
    if (Math.abs(step) < Math.abs(x) * 1e-15) break;
  }
  return x;
};
