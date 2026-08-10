import { describe, expect, it } from "vitest";
import { toContract, vendorPayloadSchema, vendorRowSchema } from "../parse";

const row = (over: Record<string, unknown> = {}) => ({
  contractID: "IBM260724C00115000",
  symbol: "IBM",
  expiration: "2026-07-24",
  strike: "115.00",
  type: "call",
  last: "96.05",
  mark: "98.20",
  bid: "96.10",
  ask: "100.30",
  volume: "4",
  open_interest: "0",
  date: "2026-07-20",
  implied_volatility: "2.56116",
  delta: "0.99254",
  gamma: "0.00036",
  theta: "-0.15836",
  vega: "0.00459",
  rho: "0.01241",
  ...over,
});

describe("vendorRowSchema", () => {
  it("parses a real vendor row", () => {
    const parsed = vendorRowSchema.parse(row());
    expect(parsed.strike).toBe(115);
    expect(parsed.mark).toBe(98.2);
    expect(parsed.type).toBe("call");
  });

  it("rejects a malformed expiration", () => {
    expect(vendorRowSchema.safeParse(row({ expiration: "24-07-2026" })).success).toBe(false);
  });

  it("rejects an unknown option type", () => {
    expect(vendorRowSchema.safeParse(row({ type: "future" })).success).toBe(false);
  });

  it("treats empty and None as missing rather than zero", () => {
    // zero is a real price, so coercing a blank to 0 would invent a quote
    const parsed = vendorRowSchema.parse(row({ bid: "", implied_volatility: "None" }));
    expect(parsed.bid).toBeNull();
    expect(parsed.implied_volatility).toBeNull();
  });

  it("treats unparseable numbers as missing", () => {
    expect(vendorRowSchema.parse(row({ delta: "n/a" })).delta).toBeNull();
  });
});

describe("toContract", () => {
  it("maps a parsed row onto the vendor contract shape", () => {
    const contract = toContract(vendorRowSchema.parse(row()));
    expect(contract).toMatchObject({
      contractId: "IBM260724C00115000",
      type: "call",
      strike: 115,
      expiration: "2026-07-24",
      bid: 96.1,
      ask: 100.3,
      mark: 98.2,
      volume: 4,
      openInterest: 0,
      vendorIv: 2.56116,
      vendorDelta: 0.99254,
    });
  });

  it("truncates fractional volume and open interest to integers", () => {
    const contract = toContract(
      vendorRowSchema.parse(row({ volume: "4.7", open_interest: "9.9" })),
    );
    expect(contract.volume).toBe(4);
    expect(contract.openInterest).toBe(9);
  });

  it("carries missing values through as null", () => {
    const contract = toContract(vendorRowSchema.parse(row({ bid: "", delta: "None" })));
    expect(contract.bid).toBeNull();
    expect(contract.vendorDelta).toBeNull();
  });
});

describe("vendorPayloadSchema", () => {
  it("accepts a payload with rows", () => {
    const parsed = vendorPayloadSchema.parse({ endpoint: "Historical Options", data: [row()] });
    expect(parsed.data).toHaveLength(1);
  });

  it("rejects a premium-rejection body, which carries no data array", () => {
    const rejection = {
      Information: "This is a premium endpoint. You may subscribe to any of the premium plans.",
    };
    expect(vendorPayloadSchema.safeParse(rejection).success).toBe(false);
  });
});
