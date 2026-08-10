import type { LegInput, PayoffInput } from "@/api/validation";
import {
  americanPrice,
  blackScholesGreeks,
  blackScholesPrice,
  buildPayoff,
  DEFAULT_STEPS,
  impliedVol,
  type Leg,
} from "@/engine";

export const priceAmerican = (input: {
  spot: number;
  strike: number;
  rate: number;
  dividendYield: number;
  vol: number;
  expiryYears: number;
  type: "call" | "put";
  steps?: number | undefined;
}) => {
  const steps = input.steps ?? DEFAULT_STEPS;
  const price = americanPrice(
    {
      type: input.type,
      S: input.spot,
      K: input.strike,
      r: input.rate,
      sigma: input.vol,
      T: input.expiryYears,
      q: input.dividendYield,
    },
    { steps },
  );

  return { price, method: "binomial-crr", stepsUsed: steps };
};

export const priceEuropean = (input: {
  spot: number;
  strike: number;
  rate: number;
  dividendYield: number;
  vol: number;
  expiryYears: number;
  type: "call" | "put";
}) => {
  const inputs = {
    type: input.type,
    S: input.spot,
    K: input.strike,
    r: input.rate,
    sigma: input.vol,
    T: input.expiryYears,
    q: input.dividendYield,
  };

  return { price: blackScholesPrice(inputs), greeks: blackScholesGreeks(inputs) };
};

export const solveImpliedVol = (input: {
  spot: number;
  strike: number;
  rate: number;
  dividendYield: number;
  marketPrice: number;
  expiryYears: number;
  type: "call" | "put";
}) => {
  const result = impliedVol({
    type: input.type,
    S: input.spot,
    K: input.strike,
    r: input.rate,
    T: input.expiryYears,
    q: input.dividendYield,
    price: input.marketPrice,
  });

  return {
    iv: result.iv,
    converged: result.converged,
    method: result.method,
    ...(result.reason === undefined ? {} : { reason: result.reason }),
  };
};

const toEngineLeg = (leg: LegInput): Leg => ({
  kind: leg.type,
  side: leg.action === "buy" ? "long" : "short",
  ...(leg.strike === undefined ? {} : { strike: leg.strike }),
  premium: leg.entryPrice,
  quantity: leg.quantity,
});

/**
 * default window spans the strikes with room either side, so the diagram shows
 * the wings rather than cutting off at the outermost strike.
 */
const defaultRange = (legs: Leg[]): { min: number; max: number } => {
  const strikes = legs.map((leg) => leg.strike).filter((k): k is number => k !== undefined);
  const anchor = strikes.length > 0 ? strikes : legs.map((leg) => leg.premium);
  const low = Math.min(...anchor);
  const high = Math.max(...anchor);
  const pad = Math.max((high - low) * 0.5, high * 0.25, 1);
  return { min: Math.max(low - pad, 0), max: high + pad };
};

export const computePayoff = (input: PayoffInput) => {
  const legs = input.legs.map(toEngineLeg);
  const range = input.spotRange ?? defaultRange(legs);
  const result = buildPayoff(legs, range);

  return {
    points: result.points,
    breakevens: result.breakevens,
    maxProfit: result.maxProfit,
    maxLoss: result.maxLoss,
    netDebit: result.netDebit,
    range: { min: range.min, max: range.max },
  };
};
