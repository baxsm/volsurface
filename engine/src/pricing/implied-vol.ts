import type { IvResult, OptionInputs } from "../types";
import { blackScholesPrice, blackScholesVega } from "./black-scholes";

export const MIN_VOL = 1e-6;
export const MAX_VOL = 5;
const NEWTON_MAX_ITER = 50;
const BRENT_MAX_ITER = 100;
const PRICE_TOL = 1e-10;
const VEGA_FLOOR = 1e-8;

export interface ImpliedVolInputs extends Omit<OptionInputs, "sigma"> {
  /** observed market price of the option */
  price: number;
}

interface Bounds {
  lower: number;
  upper: number;
}

// no-arbitrage price bounds. a quote outside these cannot be produced by ANY
// volatility, so the solver must say "no solution" rather than return a number.
const noArbBounds = ({ type, S, K, r, T, q = 0 }: Omit<ImpliedVolInputs, "price">): Bounds => {
  const fwd = S * Math.exp(-q * T);
  const disc = K * Math.exp(-r * T);
  return type === "call"
    ? { lower: Math.max(fwd - disc, 0), upper: fwd }
    : { lower: Math.max(disc - fwd, 0), upper: disc };
};

// brenner-subrahmanyam: sigma ~= sqrt(2pi/T) * price/S. exact-ish ATM, and a
// good enough starting point elsewhere for newton to take over.
const brennerSeed = (price: number, S: number, T: number): number => {
  const seed = Math.sqrt((2 * Math.PI) / T) * (price / S);
  return Math.min(Math.max(seed, 0.05), 2);
};

// brent's method on [lo, hi]: inverse quadratic interpolation with a bisection
// guard. used when newton stalls - it cannot diverge, it only bisects slower.
const brent = (
  f: (x: number) => number,
  lo: number,
  hi: number,
): { root: number; iterations: number; converged: boolean } => {
  let a = lo;
  let b = hi;
  let fa = f(a);
  let fb = f(b);

  if (fa * fb > 0) return { root: Number.NaN, iterations: 0, converged: false };

  if (Math.abs(fa) < Math.abs(fb)) {
    [a, b] = [b, a];
    [fa, fb] = [fb, fa];
  }

  let c = a;
  let fc = fa;
  let mflag = true;
  let d = 0;

  for (let i = 1; i <= BRENT_MAX_ITER; i++) {
    if (Math.abs(fb) < PRICE_TOL || Math.abs(b - a) < MIN_VOL * 1e-3) {
      return { root: b, iterations: i, converged: true };
    }

    let s: number;
    if (fa !== fc && fb !== fc) {
      // inverse quadratic interpolation
      s =
        (a * fb * fc) / ((fa - fb) * (fa - fc)) +
        (b * fa * fc) / ((fb - fa) * (fb - fc)) +
        (c * fa * fb) / ((fc - fa) * (fc - fb));
    } else {
      // secant
      s = b - (fb * (b - a)) / (fb - fa);
    }

    const lo2 = (3 * a + b) / 4;
    const bad =
      !(s > Math.min(lo2, b) && s < Math.max(lo2, b)) ||
      (mflag && Math.abs(s - b) >= Math.abs(b - c) / 2) ||
      (!mflag && Math.abs(s - b) >= Math.abs(c - d) / 2) ||
      (mflag && Math.abs(b - c) < MIN_VOL) ||
      (!mflag && Math.abs(c - d) < MIN_VOL);

    if (bad) {
      s = (a + b) / 2;
      mflag = true;
    } else {
      mflag = false;
    }

    const fs = f(s);
    d = c;
    c = b;
    fc = fb;

    if (fa * fs < 0) {
      b = s;
      fb = fs;
    } else {
      a = s;
      fa = fs;
    }

    if (Math.abs(fa) < Math.abs(fb)) {
      [a, b] = [b, a];
      [fa, fb] = [fb, fa];
    }
  }

  return { root: b, iterations: BRENT_MAX_ITER, converged: Math.abs(fb) < 1e-6 };
};

const noSolution = (reason: string): IvResult => ({
  iv: null,
  converged: false,
  method: "bounds",
  iterations: 0,
  reason,
});

// solve for the volatility that reproduces `price` under black-scholes.
// order: no-arb bounds check, brenner seed, newton-raphson, brent fallback.
// newton is fast but unreliable where vega collapses (deep ITM/OTM, near
// expiry), so any stall hands off to a bracketing method that cannot diverge.
export const impliedVol = (inputs: ImpliedVolInputs): IvResult => {
  const { price, type, S, K, r, T, q = 0 } = inputs;

  if (!(T > 0)) return noSolution("expired");
  if (!(price > 0)) return noSolution("non-positive price");

  const { lower, upper } = noArbBounds({ type, S, K, r, T, q });
  // tolerance absorbs float noise on quotes sitting exactly on the boundary
  const edge = 1e-9 * Math.max(1, S);
  if (price < lower - edge) return noSolution("price below intrinsic");
  if (price > upper + edge) return noSolution("price above no-arbitrage cap");

  const diff = (sigma: number): number => blackScholesPrice({ type, S, K, r, sigma, T, q }) - price;

  // a price at the boundary implies a degenerate vol; report the clamp rather
  // than letting newton chase an asymptote.
  if (price <= lower + edge) {
    return { iv: MIN_VOL, converged: true, method: "bounds", iterations: 0 };
  }
  if (price >= upper - edge) {
    return { iv: MAX_VOL, converged: true, method: "bounds", iterations: 0 };
  }

  let sigma = brennerSeed(price, S, T);
  let iterations = 0;

  for (let i = 0; i < NEWTON_MAX_ITER; i++) {
    iterations = i + 1;
    const err = diff(sigma);
    if (Math.abs(err) < PRICE_TOL) {
      return { iv: sigma, converged: true, method: "newton", iterations };
    }

    const vega = blackScholesVega({ S, K, r, sigma, T, q });
    // vega collapse is the classic newton failure mode - bail to brent.
    if (!Number.isFinite(vega) || vega < VEGA_FLOOR) break;

    const next = sigma - err / vega;
    if (!Number.isFinite(next) || next <= MIN_VOL || next >= MAX_VOL) break;
    if (Math.abs(next - sigma) < 1e-12) {
      return { iv: next, converged: true, method: "newton", iterations };
    }
    sigma = next;
  }

  const { root, iterations: brentIters, converged } = brent(diff, MIN_VOL, MAX_VOL);
  if (converged) {
    return { iv: root, converged: true, method: "brent", iterations: iterations + brentIters };
  }

  return {
    iv: null,
    converged: false,
    method: "brent",
    iterations: iterations + brentIters,
    reason: "no convergence",
  };
};
