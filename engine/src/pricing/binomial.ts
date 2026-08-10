import type { ExerciseStyle, OptionInputs, OptionType } from "../types";
import { blackScholesPrice } from "./black-scholes";

export interface BinomialOptions {
  /** tree steps. capped by the caller at the API boundary */
  steps?: number;
  style?: ExerciseStyle;
  /**
   * average the N and N+1 step prices. CRR error oscillates with a sawtooth as
   * the strike falls between terminal nodes; averaging adjacent step counts
   * cancels most of it. on by default.
   */
  averageSteps?: boolean;
  /**
   * price the european on the same tree and correct by (bs_exact - tree_european).
   * removes the tree's systematic discretisation bias. off by default: it helps
   * most at low step counts and costs a second pass.
   */
  controlVariate?: boolean;
}

export const DEFAULT_STEPS = 256;
export const MAX_STEPS = 5000;

const intrinsic = (type: OptionType, S: number, K: number): number =>
  type === "call" ? Math.max(S - K, 0) : Math.max(K - S, 0);

// one CRR pass. returns the option value at the root.
const crrPass = (
  { type, S, K, r, sigma, T, q = 0 }: OptionInputs,
  steps: number,
  style: ExerciseStyle,
): number => {
  const dt = T / steps;
  const u = Math.exp(sigma * Math.sqrt(dt));
  const d = 1 / u;
  const disc = Math.exp(-r * dt);
  const p = (Math.exp((r - q) * dt) - d) / (u - d);

  // p outside [0,1] means dt is too coarse for this vol/rate pair and the
  // recursion is no longer a probability-weighted average. surfacing NaN here
  // would hide the cause, so fail loudly instead.
  if (!(p >= 0 && p <= 1)) {
    throw new RangeError(
      `binomial tree unstable: risk-neutral p=${p.toFixed(4)} outside [0,1] at ${steps} steps. increase steps or check r/q/sigma.`,
    );
  }

  // terminal layer, collapsed into a single array reused on the way back.
  // indexing a Float64Array in bounds always yields a number, but
  // noUncheckedIndexedAccess still types it as possibly-undefined, hence the
  // assertions below - a runtime guard on the inner loop would cost real time.
  const values = new Float64Array(steps + 1);
  const lowest = S * d ** steps;
  const ratio = u / d;

  for (let j = 0; j <= steps; j++) {
    values[j] = intrinsic(type, lowest * ratio ** j, K);
  }

  const american = style === "american";

  for (let i = steps - 1; i >= 0; i--) {
    const layerLow = S * d ** i;
    for (let j = 0; j <= i; j++) {
      const cont = disc * (p * values[j + 1]! + (1 - p) * values[j]!);
      if (american) {
        const exer = intrinsic(type, layerLow * ratio ** j, K);
        values[j] = cont > exer ? cont : exer;
      } else {
        values[j] = cont;
      }
    }
  }

  return values[0]!;
};

export const binomialPrice = (inputs: OptionInputs, options: BinomialOptions = {}): number => {
  const {
    steps = DEFAULT_STEPS,
    style = "american",
    averageSteps = true,
    controlVariate = false,
  } = options;

  if (!Number.isInteger(steps) || steps < 1) {
    throw new RangeError(`binomial steps must be a positive integer, got ${steps}`);
  }
  if (steps > MAX_STEPS) {
    throw new RangeError(`binomial steps ${steps} exceeds cap ${MAX_STEPS}`);
  }

  // no time value left, or no uncertainty: the tree has nothing to add.
  if (!(inputs.T > 0) || !(inputs.sigma > 0)) {
    return blackScholesPrice(inputs);
  }

  const run = (n: number): number => {
    const raw = crrPass(inputs, n, style);
    if (!controlVariate) return raw;
    // same tree, european: the difference from the exact BS value is the
    // tree's discretisation error, which we subtract off.
    const treeEuro = crrPass(inputs, n, "european");
    return raw + (blackScholesPrice(inputs) - treeEuro);
  };

  return averageSteps ? (run(steps) + run(steps + 1)) / 2 : run(steps);
};

/** convenience wrapper - american is the case the tree exists for */
export const americanPrice = (
  inputs: OptionInputs,
  options: Omit<BinomialOptions, "style"> = {},
): number => binomialPrice(inputs, { ...options, style: "american" });
