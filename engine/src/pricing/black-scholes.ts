import { normCdf, normPdf } from "../math/normal";
import type { Greeks, OptionInputs, OptionType } from "../types";

// european black-scholes-merton with continuous dividend yield q.
//
// scaling conventions, fixed here and asserted in tests:
//   vega  - per 1.00 of vol (a move from 0.20 to 1.20). divide by 100 for per vol point.
//   theta - per YEAR. divide by 365 for per calendar day.
//   rho   - per 1.00 of rate. divide by 100 for per 1% (per basis point: /10000).
// these are the raw analytic derivatives; presentation scaling is the caller's job.

export interface BsCore {
  d1: number;
  d2: number;
  dfR: number;
  dfQ: number;
  sqrtT: number;
}

// closed form is only valid for T>0 and sigma>0. at the boundary the option
// collapses to its discounted intrinsic, handled by callers before reaching here.
export const bsCore = (
  S: number,
  K: number,
  r: number,
  sigma: number,
  T: number,
  q: number,
): BsCore => {
  const sqrtT = Math.sqrt(T);
  const volT = sigma * sqrtT;
  const d1 = (Math.log(S / K) + (r - q + 0.5 * sigma * sigma) * T) / volT;
  const d2 = d1 - volT;
  return { d1, d2, dfR: Math.exp(-r * T), dfQ: Math.exp(-q * T), sqrtT };
};

// value at expiry or at zero vol: the discounted forward intrinsic.
const degenerateValue = (
  type: OptionType,
  S: number,
  K: number,
  r: number,
  T: number,
  q: number,
): number => {
  const fwd = S * Math.exp(-q * T);
  const strike = K * Math.exp(-r * T);
  return type === "call" ? Math.max(fwd - strike, 0) : Math.max(strike - fwd, 0);
};

export const isDegenerate = (sigma: number, T: number): boolean => !(T > 0) || !(sigma > 0);

export const blackScholesPrice = ({ type, S, K, r, sigma, T, q = 0 }: OptionInputs): number => {
  if (isDegenerate(sigma, T)) return degenerateValue(type, S, K, r, T, q);

  const { d1, d2, dfR, dfQ } = bsCore(S, K, r, sigma, T, q);
  return type === "call"
    ? S * dfQ * normCdf(d1) - K * dfR * normCdf(d2)
    : K * dfR * normCdf(-d2) - S * dfQ * normCdf(-d1);
};

// vega is identical for calls and puts. exported separately because the IV
// solver needs it on the hot path without allocating a full greeks object.
export const blackScholesVega = ({
  S,
  K,
  r,
  sigma,
  T,
  q = 0,
}: Omit<OptionInputs, "type">): number => {
  if (isDegenerate(sigma, T)) return 0;
  const { d1, dfQ, sqrtT } = bsCore(S, K, r, sigma, T, q);
  return S * dfQ * normPdf(d1) * sqrtT;
};

export const blackScholesGreeks = ({ type, S, K, r, sigma, T, q = 0 }: OptionInputs): Greeks => {
  if (isDegenerate(sigma, T)) {
    // at expiry delta is the step function and the rest vanish. ATM delta is
    // genuinely undefined; 0.5 is the conventional midpoint.
    const itm = type === "call" ? S > K : S < K;
    const atm = S === K;
    const delta = atm ? (type === "call" ? 0.5 : -0.5) : itm ? (type === "call" ? 1 : -1) : 0;
    return { delta, gamma: 0, vega: 0, theta: 0, rho: 0 };
  }

  const { d1, d2, dfR, dfQ, sqrtT } = bsCore(S, K, r, sigma, T, q);
  const pdfD1 = normPdf(d1);

  const gamma = (dfQ * pdfD1) / (S * sigma * sqrtT);
  const vega = S * dfQ * pdfD1 * sqrtT;
  const decay = -(S * dfQ * pdfD1 * sigma) / (2 * sqrtT);

  if (type === "call") {
    return {
      delta: dfQ * normCdf(d1),
      gamma,
      vega,
      theta: decay - r * K * dfR * normCdf(d2) + q * S * dfQ * normCdf(d1),
      rho: K * T * dfR * normCdf(d2),
    };
  }

  return {
    delta: dfQ * (normCdf(d1) - 1),
    gamma,
    vega,
    theta: decay + r * K * dfR * normCdf(-d2) - q * S * dfQ * normCdf(-d1),
    rho: -K * T * dfR * normCdf(-d2),
  };
};
