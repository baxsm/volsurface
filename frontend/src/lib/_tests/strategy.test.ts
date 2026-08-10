import { describe, expect, it } from "vitest";
import {
  buildPreset,
  legsAreComplete,
  makeLeg,
  type PresetId,
  spotRangeFor,
  toPayloadLegs,
} from "../strategy";
import type { Contract, ExpiryGroup } from "../types";

const EXPIRY = "2026-07-24";

const quote = (type: "call" | "put", strike: number, mark: number | null = 5): Contract => ({
  contractId: `${type}-${strike}`,
  type,
  strike,
  bid: mark,
  ask: mark,
  last: mark,
  mark,
  volume: 10,
  openInterest: 10,
  vendorIv: 0.3,
  computedIv: 0.3,
  greeks: { delta: null, gamma: null, theta: null, vega: null, rho: null },
  ivConverged: true,
});

/** a 2.50-spaced ladder around a 213.10 spot, like the real chain */
const group = (contracts?: Contract[]): ExpiryGroup => {
  if (contracts !== undefined) return { expiration: EXPIRY, contracts };
  const built: Contract[] = [];
  for (let strike = 195; strike <= 235; strike += 2.5) {
    built.push(quote("call", strike), quote("put", strike));
  }
  return { expiration: EXPIRY, contracts: built };
};

const ctx = { group: group(), spot: 213.1 };

const build = (id: PresetId) => buildPreset(id, ctx);

describe("buildPreset", () => {
  it("builds a call debit spread long the lower strike", () => {
    const legs = build("vertical-call-debit");
    expect(legs).toHaveLength(2);
    expect(legs?.[0]).toMatchObject({ action: "buy", type: "call" });
    expect(legs?.[1]).toMatchObject({ action: "sell", type: "call" });
    expect((legs?.[1]?.strike ?? 0) > (legs?.[0]?.strike ?? 0)).toBe(true);
  });

  it("builds a put credit spread short the higher strike", () => {
    const legs = build("vertical-put-credit");
    expect(legs?.[0]).toMatchObject({ action: "sell", type: "put" });
    expect(legs?.[1]).toMatchObject({ action: "buy", type: "put" });
    expect((legs?.[1]?.strike ?? 0) < (legs?.[0]?.strike ?? 0)).toBe(true);
  });

  // a straddle whose legs land on different strikes is a strangle, so this is
  // the assertion that catches each leg rounding to spot independently
  it("puts both straddle legs on the same strike", () => {
    const legs = build("straddle");
    expect(legs).toHaveLength(2);
    expect(legs?.[0]?.strike).toBe(legs?.[1]?.strike);
    expect(legs?.every((leg) => leg.action === "buy")).toBe(true);
  });

  it("builds a strangle with the call above the put", () => {
    const legs = build("strangle");
    const call = legs?.find((leg) => leg.type === "call");
    const put = legs?.find((leg) => leg.type === "put");
    expect((call?.strike ?? 0) > (put?.strike ?? 0)).toBe(true);
  });

  it("orders the iron condor's four strikes and sides correctly", () => {
    const legs = build("iron-condor");
    expect(legs).toHaveLength(4);
    const strikes = legs?.map((leg) => leg.strike) ?? [];
    expect([...strikes].sort((a, b) => a - b)).toEqual(strikes);
    expect(legs?.map((leg) => leg.action)).toEqual(["buy", "sell", "sell", "buy"]);
    expect(legs?.map((leg) => leg.type)).toEqual(["put", "put", "call", "call"]);
  });

  it("shorts two of the butterfly body", () => {
    const legs = build("butterfly");
    expect(legs).toHaveLength(3);
    expect(legs?.[1]).toMatchObject({ action: "sell", quantity: 2 });
    expect(legs?.[0]?.action).toBe("buy");
    expect(legs?.[2]?.action).toBe("buy");
  });

  it("starts custom on a single leg", () => {
    expect(build("custom")).toHaveLength(1);
  });

  it("prices every leg from a real quote", () => {
    for (const leg of build("iron-condor") ?? []) {
      expect(leg.entryPrice).toBeGreaterThan(0);
      expect(leg.expiration).toBe(EXPIRY);
    }
  });

  // penny wing quotes are a minimum tick, not a price. building a preset on one
  // would show a position nobody could open at that premium.
  it("skips contracts with no usable price", () => {
    const contracts = [quote("call", 212.5, null), quote("call", 215, 4), quote("put", 210, 3)];
    const legs = buildPreset("custom", { group: group(contracts), spot: 213.1 });
    expect(legs?.[0]?.strike).toBe(215);
  });

  it("returns null when the expiry cannot supply the shape", () => {
    const thin = group([quote("call", 212.5)]);
    expect(buildPreset("iron-condor", { group: thin, spot: 213.1 })).toBeNull();
    expect(buildPreset("vertical-call-debit", { group: thin, spot: 213.1 })).toBeNull();
  });

  it("returns null when the expiry has no quotes at all", () => {
    expect(buildPreset("custom", { group: group([]), spot: 213.1 })).toBeNull();
  });
});

describe("spotRangeFor", () => {
  const legs = [
    makeLeg({
      action: "buy",
      type: "call",
      strike: 200,
      expiration: EXPIRY,
      quantity: 1,
      entryPrice: 5,
    }),
    makeLeg({
      action: "sell",
      type: "call",
      strike: 220,
      expiration: EXPIRY,
      quantity: 1,
      entryPrice: 2,
    }),
  ];

  it("spans past the strikes so the wings are visible", () => {
    const range = spotRangeFor(legs, 210);
    expect(range.min).toBeLessThan(200);
    expect(range.max).toBeGreaterThan(220);
  });

  it("keeps spot inside the window", () => {
    const range = spotRangeFor(legs, 250);
    expect(range.max).toBeGreaterThanOrEqual(250);
  });

  it("never returns a negative underlying price", () => {
    const cheap = [
      makeLeg({
        action: "buy",
        type: "call",
        strike: 1,
        expiration: EXPIRY,
        quantity: 1,
        entryPrice: 0.2,
      }),
    ];
    expect(spotRangeFor(cheap, 1).min).toBeGreaterThanOrEqual(0);
  });
});

describe("legsAreComplete", () => {
  const base = {
    action: "buy" as const,
    type: "call" as const,
    strike: 200,
    expiration: EXPIRY,
    quantity: 1,
    entryPrice: 5,
  };

  it("accepts a finished leg", () => {
    expect(legsAreComplete([makeLeg(base)])).toBe(true);
  });

  it("accepts a zero premium, which is a real free position", () => {
    expect(legsAreComplete([makeLeg({ ...base, entryPrice: 0 })])).toBe(true);
  });

  it("rejects a half-typed field rather than sending NaN to the api", () => {
    expect(legsAreComplete([makeLeg({ ...base, strike: Number.NaN })])).toBe(false);
    expect(legsAreComplete([makeLeg({ ...base, entryPrice: Number.NaN })])).toBe(false);
    expect(legsAreComplete([makeLeg({ ...base, quantity: Number.NaN })])).toBe(false);
  });

  it("rejects a non-positive strike or a fractional quantity", () => {
    expect(legsAreComplete([makeLeg({ ...base, strike: 0 })])).toBe(false);
    expect(legsAreComplete([makeLeg({ ...base, quantity: 1.5 })])).toBe(false);
  });

  it("rejects an empty position", () => {
    expect(legsAreComplete([])).toBe(false);
  });
});

describe("toPayloadLegs", () => {
  it("drops the local id the api does not accept", () => {
    const payload = toPayloadLegs([
      makeLeg({
        action: "buy",
        type: "call",
        strike: 200,
        expiration: EXPIRY,
        quantity: 1,
        entryPrice: 5,
      }),
    ]);
    expect(payload[0]).not.toHaveProperty("id");
    expect(payload[0]).toEqual({
      action: "buy",
      type: "call",
      strike: 200,
      expiration: EXPIRY,
      quantity: 1,
      entryPrice: 5,
    });
  });
});
