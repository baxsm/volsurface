import type { OptionType } from "./types";

export type LegKind = "call" | "put" | "stock";
export type LegSide = "long" | "short";

export interface Leg {
  kind: LegKind;
  side: LegSide;
  /** ignored for stock legs */
  strike?: number;
  /** premium per unit for options, entry price for stock */
  premium: number;
  /** contracts (or shares/100 for stock). defaults to 1 */
  quantity?: number;
}

export interface PayoffPoint {
  spot: number;
  profit: number;
}

export interface PayoffResult {
  points: PayoffPoint[];
  breakevens: number[];
  /** null when the position profits without bound above or below */
  maxProfit: number | null;
  maxLoss: number | null;
  /** negative = net credit received, positive = net debit paid */
  netDebit: number;
}

export interface PayoffRange {
  min: number;
  max: number;
  /** number of sample points across the range. defaults to 240 */
  steps?: number;
}

const sign = (side: LegSide): number => (side === "long" ? 1 : -1);

const legIntrinsic = (kind: LegKind, spot: number, strike: number): number => {
  if (kind === "stock") return spot;
  return kind === "call" ? Math.max(spot - strike, 0) : Math.max(strike - spot, 0);
};

/** net premium: positive is paid out (debit), negative is received (credit) */
export const netDebit = (legs: Leg[]): number =>
  legs.reduce((sum, leg) => sum + sign(leg.side) * leg.premium * (leg.quantity ?? 1), 0);

/** position value at expiry for a single spot, net of premium */
export const payoffAt = (legs: Leg[], spot: number): number => {
  let value = 0;
  for (const leg of legs) {
    const qty = leg.quantity ?? 1;
    const strike = leg.strike ?? 0;
    const intrinsicValue = legIntrinsic(leg.kind, spot, strike);
    value += sign(leg.side) * (intrinsicValue - leg.premium) * qty;
  }
  return value;
};

// the payoff is piecewise linear with kinks only at strikes, so slope outside
// the outermost strike is constant. that lets max profit/loss be exact rather
// than sampled: check every strike plus the behaviour beyond the wings.
const wingSlope = (legs: Leg[], direction: "up" | "down"): number => {
  let slope = 0;
  for (const leg of legs) {
    const qty = leg.quantity ?? 1;
    const s = sign(leg.side) * qty;
    if (leg.kind === "stock") slope += s;
    else if (leg.kind === "call" && direction === "up") slope += s;
    else if (leg.kind === "put" && direction === "down") slope -= s;
  }
  return slope;
};

const uniqueSorted = (xs: number[]): number[] =>
  [...new Set(xs.map((x) => Number(x.toFixed(10))))].sort((a, b) => a - b);

// linear interpolation for the zero crossing between two sample points
const crossing = (x1: number, y1: number, x2: number, y2: number): number | null => {
  if (y1 === y2) return null;
  const t = y1 / (y1 - y2);
  if (t < 0 || t > 1) return null;
  return x1 + t * (x2 - x1);
};

/**
 * breakevens solved on the exact piecewise-linear segments between strikes,
 * not scanned off the render grid - a coarse grid would miss or misplace them.
 */
export const breakevens = (legs: Leg[], range: PayoffRange): number[] => {
  const strikes = uniqueSorted(
    legs.filter((l) => l.kind !== "stock" && l.strike !== undefined).map((l) => l.strike!),
  );
  // only strikes inside the window are kinks; anything outside would introduce
  // a segment the caller never asked about
  const inner = strikes.filter((k) => k > range.min && k < range.max);
  const nodes = uniqueSorted([range.min, ...inner, range.max]);
  const found: number[] = [];

  for (let i = 0; i < nodes.length - 1; i++) {
    const a = nodes[i]!;
    const b = nodes[i + 1]!;
    const fa = payoffAt(legs, a);
    const fb = payoffAt(legs, b);

    if (fa === 0) found.push(a);
    const root = crossing(a, fa, b, fb);
    if (root !== null && root > a && root < b) found.push(root);
  }

  const last = nodes[nodes.length - 1]!;
  if (payoffAt(legs, last) === 0) found.push(last);

  return uniqueSorted(found);
};

export const buildPayoff = (legs: Leg[], range: PayoffRange): PayoffResult => {
  if (legs.length === 0) {
    throw new Error("payoff requires at least one leg");
  }
  if (!(range.max > range.min)) {
    throw new RangeError("payoff range max must be greater than min");
  }

  const steps = range.steps ?? 240;
  if (!Number.isInteger(steps) || steps < 2) {
    throw new RangeError("payoff steps must be an integer >= 2");
  }

  const strikes = uniqueSorted(
    legs.filter((l) => l.kind !== "stock" && l.strike !== undefined).map((l) => l.strike!),
  );

  // sample the range evenly, then force a sample exactly on every strike so the
  // rendered line has its vertices on the real kinks
  const grid = new Set<number>();
  const width = range.max - range.min;
  for (let i = 0; i <= steps; i++) {
    grid.add(range.min + (width * i) / steps);
  }
  for (const k of strikes) {
    if (k > range.min && k < range.max) grid.add(k);
  }

  const points: PayoffPoint[] = [...grid]
    .sort((a, b) => a - b)
    .map((spot) => ({ spot, profit: payoffAt(legs, spot) }));

  // the payoff is piecewise linear, so its extrema over the window are at the
  // kinks or the window edges - no need to scan the render grid.
  const candidates = [
    range.min,
    ...strikes.filter((k) => k > range.min && k < range.max),
    range.max,
  ];
  const values = candidates.map((s) => payoffAt(legs, s));

  // null means "grows without limit in that direction". upside is unbounded when
  // the payoff still rises above the highest strike. downside is only unbounded
  // in principle - spot cannot go below zero - so a put's profit is capped.
  const upSlope = wingSlope(legs, "up");
  const downSlope = wingSlope(legs, "down");
  const floorValue = payoffAt(legs, 0);

  const maxProfit =
    upSlope > 1e-12
      ? null
      : Math.max(...values, downSlope < -1e-12 ? floorValue : Number.NEGATIVE_INFINITY);
  const maxLoss =
    upSlope < -1e-12
      ? null
      : Math.min(...values, downSlope > 1e-12 ? floorValue : Number.POSITIVE_INFINITY);

  return {
    points,
    breakevens: breakevens(legs, range),
    maxProfit,
    maxLoss,
    netDebit: netDebit(legs),
  };
};

// named strategies, built as configs over the generic N-leg core above.

export interface VerticalSpec {
  type: OptionType;
  longStrike: number;
  shortStrike: number;
  longPremium: number;
  shortPremium: number;
  quantity?: number;
}

export const verticalSpread = ({
  type,
  longStrike,
  shortStrike,
  longPremium,
  shortPremium,
  quantity = 1,
}: VerticalSpec): Leg[] => [
  { kind: type, side: "long", strike: longStrike, premium: longPremium, quantity },
  { kind: type, side: "short", strike: shortStrike, premium: shortPremium, quantity },
];

export interface StraddleSpec {
  strike: number;
  callPremium: number;
  putPremium: number;
  side?: LegSide;
  quantity?: number;
}

export const straddle = ({
  strike,
  callPremium,
  putPremium,
  side = "long",
  quantity = 1,
}: StraddleSpec): Leg[] => [
  { kind: "call", side, strike, premium: callPremium, quantity },
  { kind: "put", side, strike, premium: putPremium, quantity },
];

export interface StrangleSpec {
  callStrike: number;
  putStrike: number;
  callPremium: number;
  putPremium: number;
  side?: LegSide;
  quantity?: number;
}

export const strangle = ({
  callStrike,
  putStrike,
  callPremium,
  putPremium,
  side = "long",
  quantity = 1,
}: StrangleSpec): Leg[] => [
  { kind: "call", side, strike: callStrike, premium: callPremium, quantity },
  { kind: "put", side, strike: putStrike, premium: putPremium, quantity },
];

export interface IronCondorSpec {
  putLongStrike: number;
  putShortStrike: number;
  callShortStrike: number;
  callLongStrike: number;
  putLongPremium: number;
  putShortPremium: number;
  callShortPremium: number;
  callLongPremium: number;
  quantity?: number;
}

/** short the inner strikes, long the wings - a credit position with capped risk */
export const ironCondor = ({
  putLongStrike,
  putShortStrike,
  callShortStrike,
  callLongStrike,
  putLongPremium,
  putShortPremium,
  callShortPremium,
  callLongPremium,
  quantity = 1,
}: IronCondorSpec): Leg[] => [
  { kind: "put", side: "long", strike: putLongStrike, premium: putLongPremium, quantity },
  { kind: "put", side: "short", strike: putShortStrike, premium: putShortPremium, quantity },
  { kind: "call", side: "short", strike: callShortStrike, premium: callShortPremium, quantity },
  { kind: "call", side: "long", strike: callLongStrike, premium: callLongPremium, quantity },
];

export interface ButterflySpec {
  type: OptionType;
  lowerStrike: number;
  bodyStrike: number;
  upperStrike: number;
  lowerPremium: number;
  bodyPremium: number;
  upperPremium: number;
  quantity?: number;
}

/** long the wings, short two of the body */
export const butterfly = ({
  type,
  lowerStrike,
  bodyStrike,
  upperStrike,
  lowerPremium,
  bodyPremium,
  upperPremium,
  quantity = 1,
}: ButterflySpec): Leg[] => [
  { kind: type, side: "long", strike: lowerStrike, premium: lowerPremium, quantity },
  { kind: type, side: "short", strike: bodyStrike, premium: bodyPremium, quantity: quantity * 2 },
  { kind: type, side: "long", strike: upperStrike, premium: upperPremium, quantity },
];

export interface CoveredCallSpec {
  stockPrice: number;
  callStrike: number;
  callPremium: number;
  quantity?: number;
}

export const coveredCall = ({
  stockPrice,
  callStrike,
  callPremium,
  quantity = 1,
}: CoveredCallSpec): Leg[] => [
  { kind: "stock", side: "long", premium: stockPrice, quantity },
  { kind: "call", side: "short", strike: callStrike, premium: callPremium, quantity },
];

export interface CollarSpec {
  stockPrice: number;
  putStrike: number;
  putPremium: number;
  callStrike: number;
  callPremium: number;
  quantity?: number;
}

export const collar = ({
  stockPrice,
  putStrike,
  putPremium,
  callStrike,
  callPremium,
  quantity = 1,
}: CollarSpec): Leg[] => [
  { kind: "stock", side: "long", premium: stockPrice, quantity },
  { kind: "put", side: "long", strike: putStrike, premium: putPremium, quantity },
  { kind: "call", side: "short", strike: callStrike, premium: callPremium, quantity },
];
