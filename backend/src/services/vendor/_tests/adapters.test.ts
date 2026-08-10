import { describe, expect, it } from "vitest";
import { rejectionNotice } from "../alpha-vantage-adapter";
import { FixtureAdapter } from "../fixture-adapter";

describe("FixtureAdapter", () => {
  const adapter = new FixtureAdapter();

  it("loads the committed IBM chain", async () => {
    const chain = await adapter.fetchChain("IBM");
    expect(chain.ticker).toBe("IBM");
    expect(chain.tradeDate).toBe("2026-07-20");
    expect(chain.contracts).toHaveLength(2444);
  });

  it("is case insensitive on the ticker", async () => {
    const chain = await adapter.fetchChain("ibm");
    expect(chain.ticker).toBe("IBM");
  });

  it("parses every contract into numbers", async () => {
    const chain = await adapter.fetchChain("IBM");
    for (const contract of chain.contracts) {
      expect(Number.isFinite(contract.strike)).toBe(true);
      expect(contract.strike).toBeGreaterThan(0);
      expect(["call", "put"]).toContain(contract.type);
      expect(contract.expiration).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it("covers the full term structure", async () => {
    const chain = await adapter.fetchChain("IBM");
    expect(new Set(chain.contracts.map((c) => c.expiration)).size).toBe(18);
  });

  it("rejects a symbol with no fixture rather than returning an empty chain", async () => {
    await expect(adapter.fetchChain("AAPL")).rejects.toThrow(/No fixture chain/);
  });
});

describe("rejectionNotice", () => {
  // alpha vantage answers 200 with an explanatory body for quota and premium
  // refusals, so a plain status check reads those as success. these are the
  // exact shapes the live api returned when tested.
  it("catches the premium-endpoint refusal", () => {
    const body = {
      Information:
        "Thank you for using Alpha Vantage! This is a premium endpoint. You may subscribe to any of the premium plans at https://www.alphavantage.co/premium/ to instantly unlock all premium endpoints",
    };
    expect(rejectionNotice(body)).toContain("premium endpoint");
  });

  it("catches the rate-limit note", () => {
    expect(
      rejectionNotice({ Note: "Please consider spreading out your free API requests" }),
    ).toContain("spreading out");
  });

  it("catches an error message", () => {
    expect(rejectionNotice({ "Error Message": "Invalid API call" })).toBe("Invalid API call");
  });

  it("passes a real payload through", () => {
    expect(rejectionNotice({ endpoint: "Historical Options", data: [] })).toBeNull();
  });

  it("ignores non-object bodies", () => {
    expect(rejectionNotice(null)).toBeNull();
    expect(rejectionNotice("text")).toBeNull();
  });
});
