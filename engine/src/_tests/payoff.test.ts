import { describe, expect, it } from "vitest";
import {
  buildPayoff,
  butterfly,
  collar,
  coveredCall,
  ironCondor,
  type Leg,
  netDebit,
  payoffAt,
  straddle,
  strangle,
  verticalSpread,
} from "../payoff";

const range = { min: 50, max: 150 };

describe("payoffAt - single legs", () => {
  it("long call: loses premium below strike, gains linearly above", () => {
    const legs: Leg[] = [{ kind: "call", side: "long", strike: 100, premium: 5 }];
    expect(payoffAt(legs, 90)).toBeCloseTo(-5, 12);
    expect(payoffAt(legs, 100)).toBeCloseTo(-5, 12);
    expect(payoffAt(legs, 105)).toBeCloseTo(0, 12);
    expect(payoffAt(legs, 120)).toBeCloseTo(15, 12);
  });

  it("short call: keeps premium below strike, loses linearly above", () => {
    const legs: Leg[] = [{ kind: "call", side: "short", strike: 100, premium: 5 }];
    expect(payoffAt(legs, 90)).toBeCloseTo(5, 12);
    expect(payoffAt(legs, 105)).toBeCloseTo(0, 12);
    expect(payoffAt(legs, 120)).toBeCloseTo(-15, 12);
  });

  it("long put: gains as spot falls, capped at strike minus premium", () => {
    const legs: Leg[] = [{ kind: "put", side: "long", strike: 100, premium: 4 }];
    expect(payoffAt(legs, 110)).toBeCloseTo(-4, 12);
    expect(payoffAt(legs, 96)).toBeCloseTo(0, 12);
    expect(payoffAt(legs, 80)).toBeCloseTo(16, 12);
    expect(payoffAt(legs, 0)).toBeCloseTo(96, 12);
  });

  it("long stock tracks spot minus entry", () => {
    const legs: Leg[] = [{ kind: "stock", side: "long", premium: 100 }];
    expect(payoffAt(legs, 120)).toBeCloseTo(20, 12);
    expect(payoffAt(legs, 85)).toBeCloseTo(-15, 12);
  });

  it("scales with quantity", () => {
    const legs: Leg[] = [{ kind: "call", side: "long", strike: 100, premium: 5, quantity: 3 }];
    expect(payoffAt(legs, 120)).toBeCloseTo(45, 12);
  });
});

describe("netDebit", () => {
  it("is positive for a paid position and negative for a credit", () => {
    expect(netDebit([{ kind: "call", side: "long", strike: 100, premium: 5 }])).toBeCloseTo(5, 12);
    expect(netDebit([{ kind: "call", side: "short", strike: 100, premium: 5 }])).toBeCloseTo(
      -5,
      12,
    );
  });

  it("nets across legs", () => {
    const legs = verticalSpread({
      type: "call",
      longStrike: 100,
      shortStrike: 110,
      longPremium: 6,
      shortPremium: 2,
    });
    expect(netDebit(legs)).toBeCloseTo(4, 12);
  });
});

describe("buildPayoff - long call", () => {
  const legs: Leg[] = [{ kind: "call", side: "long", strike: 100, premium: 5 }];
  const result = buildPayoff(legs, range);

  it("breaks even at strike plus premium", () => {
    expect(result.breakevens).toHaveLength(1);
    expect(result.breakevens[0]).toBeCloseTo(105, 8);
  });

  it("has unbounded upside and a capped loss", () => {
    expect(result.maxProfit).toBeNull();
    expect(result.maxLoss).toBeCloseTo(-5, 12);
  });

  it("samples a point exactly on the strike", () => {
    expect(result.points.some((p) => Math.abs(p.spot - 100) < 1e-12)).toBe(true);
  });
});

describe("buildPayoff - long put", () => {
  it("has bounded profit and breaks even at strike minus premium", () => {
    const legs: Leg[] = [{ kind: "put", side: "long", strike: 100, premium: 4 }];
    const result = buildPayoff(legs, { min: 0, max: 200 });
    expect(result.breakevens[0]).toBeCloseTo(96, 8);
    expect(result.maxLoss).toBeCloseTo(-4, 12);
    // capped because spot cannot go below zero
    expect(result.maxProfit).toBeCloseTo(96, 12);
  });
});

describe("buildPayoff - bull call spread", () => {
  const legs = verticalSpread({
    type: "call",
    longStrike: 100,
    shortStrike: 110,
    longPremium: 6,
    shortPremium: 2,
  });
  const result = buildPayoff(legs, range);

  it("costs a net debit of 4", () => {
    expect(result.netDebit).toBeCloseTo(4, 12);
  });

  it("breaks even at 104", () => {
    expect(result.breakevens).toHaveLength(1);
    expect(result.breakevens[0]).toBeCloseTo(104, 8);
  });

  it("caps profit at width minus debit and loss at the debit", () => {
    expect(result.maxProfit).toBeCloseTo(6, 12);
    expect(result.maxLoss).toBeCloseTo(-4, 12);
  });

  it("is flat beyond both strikes", () => {
    expect(payoffAt(legs, 130)).toBeCloseTo(payoffAt(legs, 200), 12);
    expect(payoffAt(legs, 90)).toBeCloseTo(payoffAt(legs, 60), 12);
  });
});

describe("buildPayoff - bear put spread", () => {
  it("prices a downside debit spread correctly", () => {
    const legs = verticalSpread({
      type: "put",
      longStrike: 110,
      shortStrike: 100,
      longPremium: 7,
      shortPremium: 3,
    });
    const result = buildPayoff(legs, range);
    expect(result.netDebit).toBeCloseTo(4, 12);
    expect(result.breakevens[0]).toBeCloseTo(106, 8);
    expect(result.maxProfit).toBeCloseTo(6, 12);
    expect(result.maxLoss).toBeCloseTo(-4, 12);
  });
});

describe("buildPayoff - straddle", () => {
  const legs = straddle({ strike: 100, callPremium: 6, putPremium: 5 });
  const result = buildPayoff(legs, { min: 40, max: 160 });

  it("breaks even on both sides of the strike", () => {
    expect(result.breakevens).toHaveLength(2);
    expect(result.breakevens[0]).toBeCloseTo(89, 8);
    expect(result.breakevens[1]).toBeCloseTo(111, 8);
  });

  it("loses the full premium at the strike", () => {
    expect(payoffAt(legs, 100)).toBeCloseTo(-11, 12);
    expect(result.maxLoss).toBeCloseTo(-11, 12);
    expect(result.maxProfit).toBeNull();
  });

  it("short straddle mirrors the long", () => {
    const short = straddle({ strike: 100, callPremium: 6, putPremium: 5, side: "short" });
    expect(payoffAt(short, 100)).toBeCloseTo(11, 12);
    expect(payoffAt(short, 130)).toBeCloseTo(-payoffAt(legs, 130), 12);
  });
});

describe("buildPayoff - strangle", () => {
  it("breaks even outside both strikes", () => {
    const legs = strangle({ callStrike: 110, putStrike: 90, callPremium: 3, putPremium: 2 });
    const result = buildPayoff(legs, { min: 40, max: 180 });
    expect(result.breakevens).toHaveLength(2);
    expect(result.breakevens[0]).toBeCloseTo(85, 8);
    expect(result.breakevens[1]).toBeCloseTo(115, 8);
    // flat maximum loss between the strikes
    expect(payoffAt(legs, 100)).toBeCloseTo(-5, 12);
    expect(result.maxLoss).toBeCloseTo(-5, 12);
  });
});

describe("buildPayoff - iron condor", () => {
  const legs = ironCondor({
    putLongStrike: 80,
    putShortStrike: 90,
    callShortStrike: 110,
    callLongStrike: 120,
    putLongPremium: 1,
    putShortPremium: 3,
    callShortPremium: 3,
    callLongPremium: 1,
  });
  const result = buildPayoff(legs, { min: 50, max: 150 });

  it("is a net credit of 4", () => {
    expect(result.netDebit).toBeCloseTo(-4, 12);
  });

  it("keeps the full credit between the short strikes", () => {
    expect(payoffAt(legs, 100)).toBeCloseTo(4, 12);
    expect(result.maxProfit).toBeCloseTo(4, 12);
  });

  it("caps loss at wing width minus credit", () => {
    expect(result.maxLoss).toBeCloseTo(-6, 12);
    expect(payoffAt(legs, 70)).toBeCloseTo(-6, 12);
    expect(payoffAt(legs, 130)).toBeCloseTo(-6, 12);
  });

  it("breaks even inside both wings", () => {
    expect(result.breakevens).toHaveLength(2);
    expect(result.breakevens[0]).toBeCloseTo(86, 8);
    expect(result.breakevens[1]).toBeCloseTo(114, 8);
  });
});

describe("buildPayoff - butterfly", () => {
  const legs = butterfly({
    type: "call",
    lowerStrike: 90,
    bodyStrike: 100,
    upperStrike: 110,
    lowerPremium: 12,
    bodyPremium: 6,
    upperPremium: 2,
  });
  const result = buildPayoff(legs, { min: 50, max: 150 });

  it("costs a net debit of 2", () => {
    expect(result.netDebit).toBeCloseTo(2, 12);
  });

  it("peaks at the body strike", () => {
    expect(payoffAt(legs, 100)).toBeCloseTo(8, 12);
    expect(result.maxProfit).toBeCloseTo(8, 12);
  });

  it("loses only the debit beyond the wings", () => {
    expect(payoffAt(legs, 60)).toBeCloseTo(-2, 12);
    expect(payoffAt(legs, 140)).toBeCloseTo(-2, 12);
    expect(result.maxLoss).toBeCloseTo(-2, 12);
  });

  it("breaks even either side of the body", () => {
    expect(result.breakevens).toHaveLength(2);
    expect(result.breakevens[0]).toBeCloseTo(92, 8);
    expect(result.breakevens[1]).toBeCloseTo(108, 8);
  });
});

describe("buildPayoff - stock combinations", () => {
  it("covered call caps upside at the strike", () => {
    const legs = coveredCall({ stockPrice: 100, callStrike: 110, callPremium: 4 });
    const result = buildPayoff(legs, { min: 50, max: 160 });
    expect(result.maxProfit).toBeCloseTo(14, 12);
    expect(payoffAt(legs, 150)).toBeCloseTo(14, 12);
    expect(result.breakevens[0]).toBeCloseTo(96, 8);
  });

  it("collar bounds both sides", () => {
    const legs = collar({
      stockPrice: 100,
      putStrike: 95,
      putPremium: 3,
      callStrike: 110,
      callPremium: 2,
    });
    const result = buildPayoff(legs, { min: 50, max: 160 });
    expect(result.maxProfit).toBeCloseTo(9, 12);
    expect(result.maxLoss).toBeCloseTo(-6, 12);
  });
});

describe("buildPayoff - grid and guards", () => {
  it("returns points spanning the requested range", () => {
    const legs: Leg[] = [{ kind: "call", side: "long", strike: 100, premium: 5 }];
    const result = buildPayoff(legs, { min: 50, max: 150, steps: 10 });
    expect(result.points[0]!.spot).toBeCloseTo(50, 12);
    expect(result.points[result.points.length - 1]!.spot).toBeCloseTo(150, 12);
    // 11 even samples; the strike at 100 already lands on one of them
    expect(result.points).toHaveLength(11);
  });

  it("adds a vertex when a strike falls between grid samples", () => {
    const legs: Leg[] = [{ kind: "call", side: "long", strike: 103, premium: 5 }];
    const result = buildPayoff(legs, { min: 50, max: 150, steps: 10 });
    expect(result.points).toHaveLength(12);
    expect(result.points.some((p) => Math.abs(p.spot - 103) < 1e-12)).toBe(true);
  });

  it("keeps points sorted by spot", () => {
    const legs = ironCondor({
      putLongStrike: 80,
      putShortStrike: 90,
      callShortStrike: 110,
      callLongStrike: 120,
      putLongPremium: 1,
      putShortPremium: 3,
      callShortPremium: 3,
      callLongPremium: 1,
    });
    const { points } = buildPayoff(legs, range);
    for (let i = 1; i < points.length; i++) {
      expect(points[i]!.spot).toBeGreaterThan(points[i - 1]!.spot);
    }
  });

  it("rejects an empty position", () => {
    expect(() => buildPayoff([], range)).toThrow(/at least one leg/);
  });

  it("rejects an inverted or zero-width range", () => {
    const legs: Leg[] = [{ kind: "call", side: "long", strike: 100, premium: 5 }];
    expect(() => buildPayoff(legs, { min: 150, max: 50 })).toThrow(RangeError);
    expect(() => buildPayoff(legs, { min: 100, max: 100 })).toThrow(RangeError);
  });

  it("rejects an invalid step count", () => {
    const legs: Leg[] = [{ kind: "call", side: "long", strike: 100, premium: 5 }];
    expect(() => buildPayoff(legs, { ...range, steps: 1 })).toThrow(RangeError);
    expect(() => buildPayoff(legs, { ...range, steps: 2.5 })).toThrow(RangeError);
  });

  it("reports no breakeven when the window never crosses zero", () => {
    // profitable across the whole window - the 105 breakeven is outside it
    const legs: Leg[] = [{ kind: "call", side: "long", strike: 100, premium: 5 }];
    const result = buildPayoff(legs, { min: 110, max: 150 });
    expect(result.breakevens).toHaveLength(0);
    expect(result.points.every((p) => p.profit > 0)).toBe(true);
  });

  it("ignores strikes that fall outside the requested window", () => {
    const legs: Leg[] = [{ kind: "call", side: "long", strike: 100, premium: 5 }];
    const result = buildPayoff(legs, { min: 120, max: 150 });
    expect(result.breakevens).toHaveLength(0);
    expect(result.points.every((p) => p.spot >= 120 && p.spot <= 150)).toBe(true);
  });
});
