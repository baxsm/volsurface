import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "@/app";
import { closeDb } from "@/db";
import { ingestChain } from "@/services/market/ingest";
import { seedSymbols } from "@/services/market/symbols";
import { FixtureAdapter } from "@/services/vendor";

// exercises the real hono app against real postgres. requests go through the
// full middleware chain - session, rate limit, validation - because that chain
// is where the auth and input guards actually live.

const app = createApp();

const request = (path: string, init: RequestInit = {}) =>
  app.fetch(new Request(`http://localhost${path}`, init));

const json = async (path: string, init: RequestInit = {}) => {
  const response = await request(path, init);
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
};

const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  json(path, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });

let snapshotId: string;

/** signs a user up and returns the cookie header their session needs */
const signUp = async (email: string): Promise<string> => {
  const response = await request("/api/auth/sign-up/email", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: "correct-horse-battery-staple", name: email }),
  });
  expect(response.status).toBe(200);

  const cookies = response.headers.getSetCookie();
  expect(cookies.length).toBeGreaterThan(0);
  return cookies.map((c) => c.split(";")[0]).join("; ");
};

beforeAll(async () => {
  await seedSymbols();
  const result = await ingestChain(new FixtureAdapter(), "IBM");
  snapshotId = result.snapshotId;
}, 120_000);

afterAll(async () => {
  await closeDb();
});

describe("read endpoints", () => {
  it("lists tracked symbols", async () => {
    const { status, body } = await json("/api/symbols");
    expect(status).toBe(200);
    expect(body.symbols).toEqual([
      { ticker: "IBM", name: "International Business Machines", active: true },
    ]);
  });

  it("lists snapshots with a numeric underlying price", async () => {
    const { status, body } = await json("/api/symbols/IBM/snapshots");
    expect(status).toBe(200);

    const snapshots = body.snapshots as { underlyingPrice: unknown; contractCount: number }[];
    expect(snapshots.length).toBeGreaterThan(0);
    // postgres numeric arrives as a string, so this guards the conversion
    expect(typeof snapshots[0]?.underlyingPrice).toBe("number");
    expect(snapshots[0]?.contractCount).toBe(2444);
  });

  it("returns the chain grouped by expiry", async () => {
    const { status, body } = await json(`/api/snapshots/${snapshotId}/chain`);
    expect(status).toBe(200);

    const expirations = body.expirations as { expiration: string; contracts: unknown[] }[];
    expect(expirations).toHaveLength(18);
    expect(expirations.every((e) => e.contracts.length > 0)).toBe(true);
  });

  it("filters the chain by expiration", async () => {
    const { status, body } = await json(`/api/snapshots/${snapshotId}/chain?expiration=2026-12-18`);
    expect(status).toBe(200);
    expect((body.expirations as unknown[]).length).toBe(1);
  });

  it("returns contracts with our computed iv and greeks", async () => {
    const { body } = await json(`/api/snapshots/${snapshotId}/chain?expiration=2026-12-18`);
    const expirations = body.expirations as {
      contracts: { computedIv: number | null; greeks: Record<string, number | null> }[];
    }[];
    const solved = expirations[0]?.contracts.filter((c) => c.computedIv !== null) ?? [];

    expect(solved.length).toBeGreaterThan(0);
    for (const contract of solved) {
      expect(typeof contract.greeks.delta).toBe("number");
      expect(typeof contract.greeks.vega).toBe("number");
    }
  });

  it("returns the cached surface fit", async () => {
    const { status, body } = await json(`/api/snapshots/${snapshotId}/surface`);
    expect(status).toBe(200);
    expect(body.calendarArbFree).toBe(true);
    expect((body.slices as unknown[]).length).toBe(18);

    const grid = body.grid as { expiries: string[]; moneyness: number[] };
    expect(grid.expiries).toHaveLength(18);
    expect(grid.moneyness.length).toBeGreaterThan(0);
  });

  it("404s an unknown snapshot rather than leaking a db error", async () => {
    const { status, body } = await json("/api/snapshots/does-not-exist/surface");
    expect(status).toBe(404);
    expect(body).toEqual({ error: { code: "NOT_FOUND", message: "Snapshot not found." } });
  });

  it("rejects a malformed ticker", async () => {
    const { status } = await json("/api/symbols/..%2Fevil/snapshots");
    expect(status).toBe(400);
  });
});

describe("pricing endpoints", () => {
  const european = {
    spot: 100,
    strike: 100,
    rate: 0.05,
    vol: 0.2,
    expiryYears: 1,
    type: "call" as const,
  };

  it("prices a european call at the textbook value", async () => {
    const { status, body } = await post("/api/price/european", european);
    expect(status).toBe(200);
    expect(body.price as number).toBeCloseTo(10.4506, 3);
  });

  it("prices an american put above its european value", async () => {
    const { body } = await post("/api/price/american", {
      spot: 50,
      strike: 52,
      rate: 0.05,
      vol: 0.3,
      expiryYears: 2,
      type: "put",
      steps: 500,
    });
    // early exercise is worth something, so the tree must beat black-scholes
    expect(body.price as number).toBeGreaterThan(6.7);
    expect(body.stepsUsed).toBe(500);
  });

  it("round-trips a price back to the vol that produced it", async () => {
    const { body } = await post("/api/price/iv", {
      spot: 100,
      strike: 100,
      rate: 0.05,
      marketPrice: 10.4506,
      expiryYears: 1,
      type: "call",
    });
    expect(body.iv as number).toBeCloseTo(0.2, 4);
    expect(body.converged).toBe(true);
  });

  it("reports no solution rather than a number when the price is unreachable", async () => {
    const { status, body } = await post("/api/price/iv", {
      spot: 100,
      strike: 100,
      rate: 0.05,
      // above the no-arbitrage ceiling for a call
      marketPrice: 500,
      expiryYears: 1,
      type: "call",
    });
    expect(status).toBe(200);
    expect(body.iv).toBeNull();
    expect(body.converged).toBe(false);
  });

  it("computes a payoff with exact breakevens", async () => {
    const { status, body } = await post("/api/strategy/payoff", {
      legs: [
        { action: "buy", type: "call", strike: 210, quantity: 1, entryPrice: 12.5 },
        { action: "sell", type: "call", strike: 230, quantity: 1, entryPrice: 5.25 },
      ],
    });

    expect(status).toBe(200);
    expect(body.breakevens).toEqual([217.25]);
    expect(body.maxProfit).toBeCloseTo(12.75, 9);
    expect(body.maxLoss).toBeCloseTo(-7.25, 9);
    expect(body.netDebit).toBeCloseTo(7.25, 9);
  });
});

describe("input bounds", () => {
  const cases: [string, string, unknown][] = [
    [
      "negative spot",
      "/api/price/european",
      { spot: -100, strike: 100, rate: 0.05, vol: 0.2, expiryYears: 1, type: "call" },
    ],
    [
      "zero strike",
      "/api/price/european",
      { spot: 100, strike: 0, rate: 0.05, vol: 0.2, expiryYears: 1, type: "call" },
    ],
    [
      "expiry in the past",
      "/api/price/european",
      { spot: 100, strike: 100, rate: 0.05, vol: 0.2, expiryYears: -1, type: "call" },
    ],
    [
      "tree steps above the cap",
      "/api/price/american",
      {
        spot: 100,
        strike: 100,
        rate: 0.05,
        vol: 0.2,
        expiryYears: 1,
        type: "call",
        steps: 10_000_000,
      },
    ],
    [
      "unknown field",
      "/api/price/european",
      { spot: 100, strike: 100, rate: 0.05, vol: 0.2, expiryYears: 1, type: "call", evil: 1 },
    ],
    ["no legs", "/api/strategy/payoff", { legs: [] }],
    [
      "option leg with no strike",
      "/api/strategy/payoff",
      { legs: [{ action: "buy", type: "call", quantity: 1, entryPrice: 5 }] },
    ],
  ];

  for (const [label, path, body] of cases) {
    it(`rejects ${label}`, async () => {
      const { status } = await post(path, body);
      expect(status).toBe(400);
    });
  }

  it("rejects a body that is not json", async () => {
    const { status } = await json("/api/price/european", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "not json",
    });
    expect(status).toBe(400);
  });
});

describe("auth and ownership", () => {
  it("rejects an unauthenticated read of strategies", async () => {
    const { status, body } = await json("/api/strategies");
    expect(status).toBe(401);
    expect((body.error as { code: string }).code).toBe("UNAUTHORIZED");
  });

  it("rejects unauthenticated writes", async () => {
    const { status } = await post("/api/strategies", { name: "x", kind: "custom", legs: [] });
    expect(status).toBe(401);
  });

  it("keeps one user's strategy invisible and immutable to another", async () => {
    const alice = await signUp(`alice-${Date.now()}@test.local`);
    const bob = await signUp(`bob-${Date.now()}@test.local`);

    const created = await post(
      "/api/strategies",
      {
        name: "Alice bull call spread",
        kind: "vertical",
        ticker: "IBM",
        legs: [
          {
            action: "buy",
            type: "call",
            strike: 210,
            expiration: "2026-12-18",
            quantity: 1,
            entryPrice: 12.5,
          },
          {
            action: "sell",
            type: "call",
            strike: 230,
            expiration: "2026-12-18",
            quantity: 1,
            entryPrice: 5.25,
          },
        ],
      },
      { cookie: alice },
    );
    expect(created.status).toBe(201);
    const id = created.body.id as string;

    // alice can read her own
    expect((await json(`/api/strategies/${id}`, { headers: { cookie: alice } })).status).toBe(200);

    // bob cannot read, update or delete it. NOT_FOUND rather than FORBIDDEN,
    // because a 403 would confirm the id exists
    expect((await json(`/api/strategies/${id}`, { headers: { cookie: bob } })).status).toBe(404);

    const hijack = await json(`/api/strategies/${id}`, {
      method: "PUT",
      headers: { "content-type": "application/json", cookie: bob },
      body: JSON.stringify({ name: "hijacked" }),
    });
    expect(hijack.status).toBe(404);

    const remove = await json(`/api/strategies/${id}`, {
      method: "DELETE",
      headers: { cookie: bob },
    });
    expect(remove.status).toBe(404);

    // bob's own list stays empty
    const bobList = await json("/api/strategies", { headers: { cookie: bob } });
    expect(bobList.body.strategies).toEqual([]);

    // and alice's row survived all three attempts unchanged
    const after = await json(`/api/strategies/${id}`, { headers: { cookie: alice } });
    expect(after.status).toBe(200);
    expect(after.body.name).toBe("Alice bull call spread");
    expect((after.body.legs as unknown[]).length).toBe(2);
  }, 60_000);

  it("lets an owner update and delete their own strategy", async () => {
    const cookie = await signUp(`carol-${Date.now()}@test.local`);

    const created = await post(
      "/api/strategies",
      {
        name: "Carol straddle",
        kind: "straddle",
        legs: [
          {
            action: "buy",
            type: "call",
            strike: 210,
            expiration: "2026-12-18",
            quantity: 1,
            entryPrice: 12.5,
          },
        ],
      },
      { cookie },
    );
    const id = created.body.id as string;

    const updated = await json(`/api/strategies/${id}`, {
      method: "PUT",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ name: "Carol renamed" }),
    });
    expect(updated.status).toBe(200);
    expect(updated.body.name).toBe("Carol renamed");

    const removed = await request(`/api/strategies/${id}`, {
      method: "DELETE",
      headers: { cookie },
    });
    expect(removed.status).toBe(204);

    expect((await json(`/api/strategies/${id}`, { headers: { cookie } })).status).toBe(404);
  }, 60_000);

  it("refuses to save a stock leg, which the schema cannot represent", async () => {
    const cookie = await signUp(`dave-${Date.now()}@test.local`);
    const { status } = await post(
      "/api/strategies",
      {
        name: "Covered call",
        kind: "covered-call",
        legs: [{ action: "buy", type: "stock", quantity: 1, entryPrice: 210 }],
      },
      { cookie },
    );
    expect(status).toBe(400);
  }, 60_000);
});

describe("transport", () => {
  it("sets the security headers", async () => {
    const response = await request("/api/symbols");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("x-frame-options")).toBe("DENY");
    expect(response.headers.get("content-security-policy")).toContain("default-src 'none'");
  });

  it("404s an unknown route in the standard error shape", async () => {
    const { status, body } = await json("/api/nope");
    expect(status).toBe(404);
    expect((body.error as { code: string }).code).toBe("NOT_FOUND");
  });

  it("hides the ops route from callers without the token", async () => {
    const { status } = await post("/internal/ingest", { ticker: "IBM" });
    expect(status).toBe(404);
  });

  it("hides the ops route from a wrong token", async () => {
    const { status } = await post(
      "/internal/ingest",
      { ticker: "IBM" },
      { "x-ops-token": "definitely-not-the-token" },
    );
    expect(status).toBe(404);
  });
});
