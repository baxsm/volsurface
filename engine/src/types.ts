export type OptionType = "call" | "put";

export type ExerciseStyle = "european" | "american";

export interface OptionInputs {
  type: OptionType;
  /** spot price of the underlying */
  S: number;
  /** strike */
  K: number;
  /** continuously compounded risk-free rate, as a decimal (0.05 = 5%) */
  r: number;
  /** volatility, as a decimal (0.20 = 20%) */
  sigma: number;
  /** time to expiry in years */
  T: number;
  /** continuous dividend yield, as a decimal. defaults to 0 */
  q?: number;
}

export interface Greeks {
  /** dV/dS */
  delta: number;
  /** d2V/dS2 */
  gamma: number;
  /** dV/dsigma, per 1.00 of vol */
  vega: number;
  /** dV/dt, per year */
  theta: number;
  /** dV/dr, per 1.00 of rate */
  rho: number;
}

export type IvMethod = "newton" | "brent" | "bounds";

export interface IvResult {
  /** null when no volatility reproduces the given price */
  iv: number | null;
  converged: boolean;
  method: IvMethod;
  iterations: number;
  /** set when converged is false, explaining which guard rejected the input */
  reason?: string;
}

/** raw SVI parameters for one expiry slice */
export interface SviParams {
  /** overall level of total variance */
  a: number;
  /** wing slope, non-negative */
  b: number;
  /** skew, in (-1, 1). negative is the usual equity down-skew */
  rho: number;
  /** horizontal shift of the vertex, in log-moneyness */
  m: number;
  /** vertex roundness, positive */
  sigma: number;
}

/** one observed point on a slice, in log-moneyness and total variance */
export interface SviQuote {
  /** log-moneyness ln(K/F) */
  k: number;
  /** total variance IV^2 * T */
  w: number;
  /** least-squares weight. higher means trust this quote more */
  weight: number;
}

export interface SviSliceInput {
  expiration: string;
  /** time to expiry in years */
  t: number;
  /** forward price for this expiry, used to convert strikes to log-moneyness */
  forward: number;
  quotes: SviQuote[];
}

export interface SviSliceFit {
  expiration: string;
  t: number;
  params: SviParams;
  quoteCount: number;
  /** weighted root-mean-square error in total variance */
  rmse: number;
  iterations: number;
  butterflyArbFree: boolean;
  /** log-moneyness range the quotes actually covered. outside it the slice extrapolates */
  kMin: number;
  kMax: number;
  /** set when the calendar pass lifted this slice to stop it crossing an earlier one */
  calendarRepaired?: boolean;
}

export interface SurfaceGrid {
  /** log-moneyness samples, shared across every expiry */
  moneyness: number[];
  expiries: string[];
  /** time to expiry in years, index-aligned with expiries */
  years: number[];
  /** absolute strike per [expiry][moneyness] */
  strikes: number[][];
  /** implied vol per [expiry][moneyness]. null where the slice has no positive variance */
  iv: (number | null)[][];
}

export interface SurfaceFitResult {
  slices: SviSliceFit[];
  grid: SurfaceGrid;
  calendarArbFree: boolean;
  crossings: {
    earlierExpiration: string;
    laterExpiration: string;
    k: number;
    gap: number;
  }[];
  /** expiries dropped for having too few usable quotes to fit */
  skippedExpirations: string[];
}
