import { describe, expect, it } from "vitest";
import { filterQuotes, type RawQuote } from "../quotes";

const raw = (over: Partial<RawQuote> = {}): RawQuote => ({
  strike: 200,
  mark: 5,
  bid: 4.9,
  ask: 5.1,
  volume: 50,
  openInterest: 500,
  iv: 0.4,
  ...over,
});

const FORWARD = 200;
const T = 0.5;

describe("filterQuotes", () => {
  it("keeps a liquid, tightly quoted contract", () => {
    const { quotes, dropped } = filterQuotes([raw()], FORWARD, T);
    expect(quotes).toHaveLength(1);
    expect(dropped).toEqual({ penny: 0, illiquid: 0, wideSpread: 0, unsolved: 0 });
  });

  it("converts to log-moneyness and total variance", () => {
    const { quotes } = filterQuotes([raw({ strike: 220, iv: 0.5 })], FORWARD, T);
    const quote = quotes[0];
    expect(quote?.k).toBeCloseTo(Math.log(220 / 200), 12);
    expect(quote?.w).toBeCloseTo(0.5 * 0.5 * T, 12);
  });

  it("drops penny marks that are a tick rather than a price", () => {
    const { quotes, dropped } = filterQuotes([raw({ mark: 0.01, bid: 0, ask: 0.01 })], FORWARD, T);
    expect(quotes).toHaveLength(0);
    expect(dropped.penny).toBe(1);
  });

  it("drops contracts with no volume and negligible open interest", () => {
    const { quotes, dropped } = filterQuotes([raw({ volume: 0, openInterest: 2 })], FORWARD, T);
    expect(quotes).toHaveLength(0);
    expect(dropped.illiquid).toBe(1);
  });

  it("keeps a zero-volume contract that carries real open interest", () => {
    const { quotes } = filterQuotes([raw({ volume: 0, openInterest: 500 })], FORWARD, T);
    expect(quotes).toHaveLength(1);
  });

  it("drops quotes wider than the spread limit", () => {
    // 3.0 wide on a 5.0 mark is 60% - inside the default 75% limit
    const inside = filterQuotes([raw({ bid: 3.5, ask: 6.5 })], FORWARD, T);
    expect(inside.quotes).toHaveLength(1);

    // 4.5 wide on a 5.0 mark is 90% - outside it
    const outside = filterQuotes([raw({ bid: 2.75, ask: 7.25 })], FORWARD, T);
    expect(outside.quotes).toHaveLength(0);
    expect(outside.dropped.wideSpread).toBe(1);
  });

  it("drops one-sided markets, which have no measurable width", () => {
    const { quotes, dropped } = filterQuotes([raw({ bid: 0, ask: 5.1 })], FORWARD, T);
    expect(quotes).toHaveLength(0);
    expect(dropped.wideSpread).toBe(1);
  });

  it("drops contracts whose iv never solved", () => {
    const { quotes, dropped } = filterQuotes([raw({ iv: null })], FORWARD, T);
    expect(quotes).toHaveLength(0);
    expect(dropped.unsolved).toBe(1);
  });

  it("weights a tight market above a wide one", () => {
    const tight = filterQuotes([raw({ bid: 4.95, ask: 5.05 })], FORWARD, T).quotes[0];
    const wide = filterQuotes([raw({ bid: 4, ask: 6 })], FORWARD, T).quotes[0];
    expect(tight?.weight).toBeGreaterThan(wide?.weight ?? 0);
    expect(tight?.weight).toBeLessThanOrEqual(1);
    expect(wide?.weight).toBeGreaterThan(0);
  });

  it("honours overridden thresholds", () => {
    const strict = filterQuotes([raw({ mark: 0.5 })], FORWARD, T, { minMark: 1 });
    expect(strict.dropped.penny).toBe(1);

    const lenient = filterQuotes([raw({ volume: 0, openInterest: 1 })], FORWARD, T, {
      minOpenInterest: 0,
    });
    expect(lenient.quotes).toHaveLength(1);
  });

  it("rejects a non-positive forward or expiry rather than emitting NaN", () => {
    expect(filterQuotes([raw()], 0, T).quotes).toHaveLength(0);
    expect(filterQuotes([raw()], FORWARD, 0).quotes).toHaveLength(0);
    expect(filterQuotes([raw({ strike: 0 })], FORWARD, T).quotes).toHaveLength(0);
  });

  it("counts each drop reason separately across a mixed chain", () => {
    const { quotes, dropped } = filterQuotes(
      [
        raw(),
        raw({ mark: 0.01 }),
        raw({ volume: 0, openInterest: 0 }),
        raw({ bid: 1, ask: 9 }),
        raw({ iv: null }),
      ],
      FORWARD,
      T,
    );
    expect(quotes).toHaveLength(1);
    expect(dropped).toEqual({ penny: 1, illiquid: 1, wideSpread: 1, unsolved: 1 });
  });
});
