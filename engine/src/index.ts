export { normCdf, normInvCdf, normPdf } from "./math/normal";
export {
  type ButterflySpec,
  breakevens,
  buildPayoff,
  butterfly,
  type CollarSpec,
  type CoveredCallSpec,
  collar,
  coveredCall,
  type IronCondorSpec,
  ironCondor,
  type Leg,
  type LegKind,
  type LegSide,
  netDebit,
  type PayoffPoint,
  type PayoffRange,
  type PayoffResult,
  payoffAt,
  type StraddleSpec,
  type StrangleSpec,
  straddle,
  strangle,
  type VerticalSpec,
  verticalSpread,
} from "./payoff";
export {
  americanPrice,
  type BinomialOptions,
  binomialPrice,
  DEFAULT_STEPS,
  MAX_STEPS,
} from "./pricing/binomial";
export {
  blackScholesGreeks,
  blackScholesPrice,
  blackScholesVega,
} from "./pricing/black-scholes";

export {
  type ImpliedVolInputs,
  impliedVol,
  MAX_VOL,
  MIN_VOL,
} from "./pricing/implied-vol";
export type {
  ExerciseStyle,
  Greeks,
  IvMethod,
  IvResult,
  OptionInputs,
  OptionType,
} from "./types";
