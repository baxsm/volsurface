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
