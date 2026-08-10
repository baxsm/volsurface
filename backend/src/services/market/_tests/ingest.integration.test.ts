import { and, eq, isNotNull, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeDb, db, schema } from "@/db";
import { FixtureAdapter } from "@/services/vendor";
import { ingestChain } from "../ingest";
import { seedSymbols } from "../symbols";

// runs against the real postgres from docker-compose, not a mock. mocked
// persistence would prove the code calls drizzle, not that the schema accepts
// what ingestion writes - numeric precision, enum values and the unique
// constraints only fail against a real server.

let result: Awaited<ReturnType<typeof ingestChain>>;

beforeAll(async () => {
  await seedSymbols();
  result = await ingestChain(new FixtureAdapter(), "IBM");
}, 120_000);

afterAll(async () => {
  await closeDb();
});

describe("chain ingestion against real postgres", () => {
  it("stores the whole chain", () => {
    expect(result.ticker).toBe("IBM");
    expect(result.tradeDate).toBe("2026-07-20");
    expect(result.contractCount).toBe(2444);
  });

  it("recovers an underlying price close to the parity estimate", () => {
    // vendor-fixture.test.ts lands on ~212.98 from the front expiry
    expect(result.underlyingPrice).toBeGreaterThan(210);
    expect(result.underlyingPrice).toBeLessThan(216);
  });

  it("writes exactly the contracts it reported", async () => {
    const [row] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.contract)
      .where(eq(schema.contract.snapshotId, result.snapshotId));

    expect(row?.count).toBe(2444);
  });

  it("marks the snapshot ok with the rate it priced under", async () => {
    const [row] = await db
      .select({
        status: schema.snapshot.status,
        rate: schema.snapshot.rate,
        contractCount: schema.snapshot.contractCount,
      })
      .from(schema.snapshot)
      .where(eq(schema.snapshot.id, result.snapshotId));

    expect(row?.status).toBe("ok");
    expect(Number.parseFloat(row?.rate ?? "0")).toBeGreaterThan(0);
    expect(row?.contractCount).toBe(2444);
  });

  it("stores our own solved iv for the overwhelming majority of contracts", async () => {
    const [row] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.contract)
      .where(
        and(
          eq(schema.contract.snapshotId, result.snapshotId),
          isNotNull(schema.contract.computedIv),
        ),
      );

    expect(row?.count).toBeGreaterThan(2300);
    expect(result.solvedCount).toBe(row?.count);
  });

  it("stores greeks wherever it stored an iv", async () => {
    // a row with an iv but no greeks would render as a blank column in the ui
    const [row] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.contract)
      .where(
        and(
          eq(schema.contract.snapshotId, result.snapshotId),
          isNotNull(schema.contract.computedIv),
          sql`${schema.contract.computedDelta} IS NULL`,
        ),
      );

    expect(row?.count).toBe(0);
  });

  it("keeps the vendor values alongside ours as a cross-check", async () => {
    const [row] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.contract)
      .where(
        and(
          eq(schema.contract.snapshotId, result.snapshotId),
          isNotNull(schema.contract.vendorIv),
          isNotNull(schema.contract.computedIv),
        ),
      );

    expect(row?.count).toBeGreaterThan(2300);
  });

  it("caches an arbitrage-free surface fit", async () => {
    const [row] = await db
      .select({
        calendarArbFree: schema.surfaceFit.calendarArbFree,
        slices: schema.surfaceFit.slices,
        grid: schema.surfaceFit.grid,
        skipped: schema.surfaceFit.skippedExpirations,
      })
      .from(schema.surfaceFit)
      .where(eq(schema.surfaceFit.snapshotId, result.snapshotId));

    expect(row).toBeDefined();
    if (row === undefined) return;

    expect(row.calendarArbFree).toBe(true);
    expect(Array.isArray(row.slices)).toBe(true);
    expect((row.slices as unknown[]).length).toBe(18);
    expect((row.skipped as unknown[]).length).toBe(0);

    const grid = row.grid as { expiries: string[]; iv: (number | null)[][] };
    expect(grid.expiries).toHaveLength(18);
    expect(grid.iv).toHaveLength(18);
  });

  it("fits every expiry in the chain", () => {
    expect(result.fittedExpirations).toBe(18);
    expect(result.skippedExpirations).toEqual([]);
    expect(result.calendarArbFree).toBe(true);
  });

  it("is idempotent - re-ingesting replaces rather than duplicates", async () => {
    const again = await ingestChain(new FixtureAdapter(), "IBM");
    expect(again.snapshotId).toBe(result.snapshotId);

    const [contracts] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.contract)
      .where(eq(schema.contract.snapshotId, result.snapshotId));
    expect(contracts?.count).toBe(2444);

    const [fits] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.surfaceFit)
      .where(eq(schema.surfaceFit.snapshotId, result.snapshotId));
    expect(fits?.count).toBe(1);
  }, 120_000);

  it("refuses a symbol it does not track", async () => {
    await expect(ingestChain(new FixtureAdapter(), "NOPE")).rejects.toThrow(/not a tracked symbol/);
  });
});
