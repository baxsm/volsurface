import { describe, expect, it } from "vitest";
import type { VendorContract } from "../../vendor/types";
import { forwardPrice, impliedSpot, yearsBetween } from "../pricing-inputs";

const contract = (over: Partial<VendorContract> = {}): VendorContract => ({
  contractId: "X",
  type: "call",
  strike: 100,
  expiration: "2027-01-01",
  bid: null,
  ask: null,
  last: null,
  mark: 10,
  volume: null,
  openInterest: null,
  vendorIv: null,
  vendorDelta: null,
  vendorGamma: null,
  vendorTheta: null,
  vendorVega: null,
  vendorRho: null,
  ...over,
});

describe("yearsBetween", () => {
  it("measures a year as one", () => {
    expect(yearsBetween("2026-01-01", "2027-01-01")).toBeCloseTo(1, 6);
  });

  it("returns zero for the same day", () => {
    expect(yearsBetween("2026-07-20", "2026-07-20")).toBe(0);
  });

  it("goes negative for an already expired contract", () => {
    expect(yearsBetween("2026-07-20", "2026-07-19")).toBeLessThan(0);
  });
});

describe("forwardPrice", () => {
  it("equals spot when carry is zero", () => {
    expect(forwardPrice(100, 0.03, 0.03, 1)).toBeCloseTo(100, 9);
  });

  it("rises above spot when the rate exceeds the dividend yield", () => {
    expect(forwardPrice(100, 0.05, 0.01, 1)).toBeCloseTo(100 * Math.exp(0.04), 9);
  });

  it("falls below spot when the dividend yield exceeds the rate", () => {
    expect(forwardPrice(100, 0.01, 0.05, 1)).toBeLessThan(100);
  });
});

describe("impliedSpot", () => {
  const rate = 0.04;

  it("recovers spot from a clean parity pair", () => {
    // build a pair that satisfies C - P = S*e^-qT - K*e^-rT exactly
    const spot = 200;
    const t = yearsBetween("2026-07-20", "2027-01-15");
    const strike = 200;
    const call = 15;
    const put = call - (spot - strike * Math.exp(-rate * t));

    const recovered = impliedSpot(
      [
        contract({ type: "call", strike, expiration: "2027-01-15", mark: call }),
        contract({ type: "put", strike, expiration: "2027-01-15", mark: put }),
      ],
      "2026-07-20",
      rate,
      0,
    );

    expect(recovered).toBeCloseTo(spot, 6);
  });

  it("prefers the strike where call and put are closest", () => {
    // the wide pair carries a deliberately wrong spot. the tight pair should win
    const t = yearsBetween("2026-07-20", "2027-01-15");
    const tightStrike = 200;
    const tightCall = 12;
    const tightPut = tightCall - (200 - tightStrike * Math.exp(-rate * t));

    const recovered = impliedSpot(
      [
        contract({ type: "call", strike: 100, expiration: "2027-01-15", mark: 105 }),
        contract({ type: "put", strike: 100, expiration: "2027-01-15", mark: 0.2 }),
        contract({ type: "call", strike: tightStrike, expiration: "2027-01-15", mark: tightCall }),
        contract({ type: "put", strike: tightStrike, expiration: "2027-01-15", mark: tightPut }),
      ],
      "2026-07-20",
      rate,
      0,
    );

    expect(recovered).toBeCloseTo(200, 6);
  });

  it("uses the front expiry, which carries the least dividend contamination", () => {
    const build = (expiration: string, spot: number) => {
      const t = yearsBetween("2026-07-20", expiration);
      const strike = 200;
      const call = 12;
      const put = call - (spot - strike * Math.exp(-rate * t));
      return [
        contract({ type: "call", strike, expiration, mark: call }),
        contract({ type: "put", strike, expiration, mark: put }),
      ];
    };

    const recovered = impliedSpot(
      [...build("2028-01-15", 180), ...build("2026-09-18", 210)],
      "2026-07-20",
      rate,
      0,
    );

    expect(recovered).toBeCloseTo(210, 6);
  });

  it("grosses the recovered spot up by the dividend yield", () => {
    const withYield = impliedSpot(
      [
        contract({ type: "call", strike: 200, expiration: "2027-07-20", mark: 12 }),
        contract({ type: "put", strike: 200, expiration: "2027-07-20", mark: 8 }),
      ],
      "2026-07-20",
      rate,
      0.05,
    );
    const withoutYield = impliedSpot(
      [
        contract({ type: "call", strike: 200, expiration: "2027-07-20", mark: 12 }),
        contract({ type: "put", strike: 200, expiration: "2027-07-20", mark: 8 }),
      ],
      "2026-07-20",
      rate,
      0,
    );

    expect(withYield as number).toBeGreaterThan(withoutYield as number);
  });

  it("returns null when no expiry has both a call and a put", () => {
    expect(impliedSpot([contract({ type: "call", mark: 10 })], "2026-07-20", rate, 0)).toBeNull();
  });

  it("ignores expired contracts and non-positive marks", () => {
    expect(
      impliedSpot(
        [
          contract({ type: "call", expiration: "2026-01-01", mark: 10 }),
          contract({ type: "put", expiration: "2026-01-01", mark: 5 }),
          contract({ type: "call", expiration: "2027-01-01", mark: 0 }),
          contract({ type: "put", expiration: "2027-01-01", mark: 5 }),
        ],
        "2026-07-20",
        rate,
        0,
      ),
    ).toBeNull();
  });
});
