import type { Chain, Contract, ExpiryGroup } from "./types";

export type LegAction = "buy" | "sell";
export type LegType = "call" | "put";

export interface StrategyLeg {
  /** stable across edits so react keys and springs do not reshuffle rows */
  id: string;
  action: LegAction;
  type: LegType;
  strike: number;
  expiration: string;
  quantity: number;
  entryPrice: number;
}

export interface PayoffPoint {
  spot: number;
  profit: number;
}

export interface PayoffResult {
  points: PayoffPoint[];
  breakevens: number[];
  maxProfit: number | null;
  maxLoss: number | null;
  netDebit: number;
  range: { min: number; max: number };
}

export type PresetId =
  | "custom"
  | "vertical-call-debit"
  | "vertical-put-credit"
  | "straddle"
  | "strangle"
  | "iron-condor"
  | "butterfly";

export interface Preset {
  id: PresetId;
  label: string;
  summary: string;
}

export const PRESETS: Preset[] = [
  {
    id: "vertical-call-debit",
    label: "Call debit spread",
    summary: "Long a call, short a higher one. Capped gain, capped loss.",
  },
  {
    id: "vertical-put-credit",
    label: "Put credit spread",
    summary: "Short a put, long a lower one. Collects premium, capped risk.",
  },
  { id: "straddle", label: "Straddle", summary: "Long the call and put at the money." },
  { id: "strangle", label: "Strangle", summary: "Long an out-of-the-money call and put." },
  {
    id: "iron-condor",
    label: "Iron condor",
    summary: "Short both wings, long further out. Profits in a range.",
  },
  { id: "butterfly", label: "Butterfly", summary: "Long the wings, short two of the body." },
  { id: "custom", label: "Custom", summary: "Start from one leg and build it yourself." },
];

let counter = 0;
/** react key only, so a monotonic counter beats crypto ids here */
const nextId = (): string => {
  counter += 1;
  return `leg-${counter}`;
};

export const makeLeg = (leg: Omit<StrategyLeg, "id">): StrategyLeg => ({ ...leg, id: nextId() });

/** the mark is what a position would realistically open at. bid/ask midpoint is
    already the mark server-side, so a missing mark means the quote was unusable */
const priceOf = (contract: Contract): number | null =>
  contract.mark ?? contract.last ?? contract.bid ?? null;

const isPriced = (contract: Contract): boolean => {
  const price = priceOf(contract);
  return price !== null && price > 0;
};

/**
 * nearest priced contract at or beyond an offset from spot. presets are built
 * from quotes that actually exist in the chain rather than invented strikes, so
 * the premiums on screen are real marks and the payoff is a position a user
 * could have opened.
 */
const pick = (contracts: Contract[], type: LegType, target: number): Contract | null => {
  const candidates = contracts.filter((c) => c.type === type && isPriced(c));
  if (candidates.length === 0) return null;

  let best = candidates[0] as Contract;
  let bestGap = Math.abs(best.strike - target);
  for (const contract of candidates) {
    const gap = Math.abs(contract.strike - target);
    if (gap < bestGap) {
      best = contract;
      bestGap = gap;
    }
  }
  return best;
};

/** distinct strikes so a two-leg spread never collapses onto one strike */
const pickDistinct = (
  contracts: Contract[],
  type: LegType,
  target: number,
  taken: number[],
): Contract | null => {
  const candidates = contracts
    .filter((c) => c.type === type && isPriced(c) && !taken.includes(c.strike))
    .sort((a, b) => Math.abs(a.strike - target) - Math.abs(b.strike - target));
  return candidates[0] ?? null;
};

const toLeg = (contract: Contract, action: LegAction, expiration: string, quantity = 1) =>
  makeLeg({
    action,
    type: contract.type,
    strike: contract.strike,
    expiration,
    quantity,
    entryPrice: priceOf(contract) ?? 0,
  });

/** typical strike spacing, used to place wings a sensible distance out */
const strikeStep = (contracts: Contract[]): number => {
  const strikes = [...new Set(contracts.map((c) => c.strike))].sort((a, b) => a - b);
  if (strikes.length < 2) return 5;
  const gaps: number[] = [];
  for (let i = 1; i < strikes.length; i++) {
    const gap = (strikes[i] as number) - (strikes[i - 1] as number);
    if (gap > 0) gaps.push(gap);
  }
  if (gaps.length === 0) return 5;
  gaps.sort((a, b) => a - b);
  return gaps[Math.floor(gaps.length / 2)] as number;
};

export interface PresetContext {
  group: ExpiryGroup;
  spot: number;
}

/**
 * builds a preset's legs from a real expiry's quotes. returns null when the
 * expiry cannot supply the strikes the shape needs, so the caller can say so
 * rather than render a half-built position.
 */
export const buildPreset = (id: PresetId, { group, spot }: PresetContext): StrategyLeg[] | null => {
  const contracts = group.contracts;
  const expiry = group.expiration;
  const step = strikeStep(contracts);

  const atmCall = pick(contracts, "call", spot);
  const atmPut = pick(contracts, "put", spot);

  if (id === "custom") {
    if (atmCall === null) return null;
    return [toLeg(atmCall, "buy", expiry)];
  }

  if (id === "vertical-call-debit") {
    if (atmCall === null) return null;
    const short = pickDistinct(contracts, "call", atmCall.strike + step * 2, [atmCall.strike]);
    if (short === null) return null;
    return [toLeg(atmCall, "buy", expiry), toLeg(short, "sell", expiry)];
  }

  if (id === "vertical-put-credit") {
    if (atmPut === null) return null;
    const long = pickDistinct(contracts, "put", atmPut.strike - step * 2, [atmPut.strike]);
    if (long === null) return null;
    return [toLeg(atmPut, "sell", expiry), toLeg(long, "buy", expiry)];
  }

  if (id === "straddle") {
    if (atmCall === null || atmPut === null) return null;
    // both legs of a straddle sit on one strike, so the put has to match the
    // call's strike rather than independently rounding to a different one
    const matchedPut = pick(contracts, "put", atmCall.strike);
    if (matchedPut === null) return null;
    return [toLeg(atmCall, "buy", expiry), toLeg(matchedPut, "buy", expiry)];
  }

  if (id === "strangle") {
    const call = pick(contracts, "call", spot + step * 2);
    const put = pick(contracts, "put", spot - step * 2);
    if (call === null || put === null || call.strike <= put.strike) return null;
    return [toLeg(call, "buy", expiry), toLeg(put, "buy", expiry)];
  }

  if (id === "iron-condor") {
    const shortPut = pick(contracts, "put", spot - step * 2);
    const shortCall = pick(contracts, "call", spot + step * 2);
    if (shortPut === null || shortCall === null || shortCall.strike <= shortPut.strike) return null;
    const longPut = pickDistinct(contracts, "put", shortPut.strike - step * 2, [shortPut.strike]);
    const longCall = pickDistinct(contracts, "call", shortCall.strike + step * 2, [
      shortCall.strike,
    ]);
    if (longPut === null || longCall === null) return null;
    if (longPut.strike >= shortPut.strike || longCall.strike <= shortCall.strike) return null;
    return [
      toLeg(longPut, "buy", expiry),
      toLeg(shortPut, "sell", expiry),
      toLeg(shortCall, "sell", expiry),
      toLeg(longCall, "buy", expiry),
    ];
  }

  // butterfly: long the wings, short two of the body
  if (atmCall === null) return null;
  const lower = pickDistinct(contracts, "call", atmCall.strike - step * 2, [atmCall.strike]);
  const upper = pickDistinct(contracts, "call", atmCall.strike + step * 2, [atmCall.strike]);
  if (lower === null || upper === null) return null;
  if (lower.strike >= atmCall.strike || upper.strike <= atmCall.strike) return null;
  return [
    toLeg(lower, "buy", expiry),
    toLeg(atmCall, "sell", expiry, 2),
    toLeg(upper, "buy", expiry),
  ];
};

/**
 * the window the diagram is drawn over. the engine's own default spans far past
 * the strikes, which squeezes the interesting part into the middle, so the
 * builder asks for a tighter window around the position and the spot.
 */
export const spotRangeFor = (
  legs: StrategyLeg[],
  spot: number | null,
): { min: number; max: number } => {
  const strikes = legs.map((leg) => leg.strike).filter((k) => Number.isFinite(k) && k > 0);
  const anchors = spot === null || spot <= 0 ? strikes : [...strikes, spot];
  if (anchors.length === 0) return { min: 0, max: 100 };

  const low = Math.min(...anchors);
  const high = Math.max(...anchors);
  const pad = Math.max((high - low) * 0.6, high * 0.12, 1);
  return { min: Math.max(low - pad, 0), max: high + pad };
};

/** the api rejects a leg whose price or strike is not a real number */
export const legsAreComplete = (legs: StrategyLeg[]): boolean =>
  legs.length > 0 &&
  legs.every(
    (leg) =>
      Number.isFinite(leg.strike) &&
      leg.strike > 0 &&
      Number.isFinite(leg.entryPrice) &&
      leg.entryPrice >= 0 &&
      Number.isInteger(leg.quantity) &&
      leg.quantity >= 1,
  );

/** what the api wants: our ids and display-only fields are not part of it */
export const toPayloadLegs = (legs: StrategyLeg[]) =>
  legs.map((leg) => ({
    action: leg.action,
    type: leg.type,
    strike: leg.strike,
    expiration: leg.expiration,
    quantity: leg.quantity,
    entryPrice: leg.entryPrice,
  }));

export const findGroup = (chain: Chain | undefined, expiration: string | null) =>
  chain?.expirations.find((group) => group.expiration === expiration);
