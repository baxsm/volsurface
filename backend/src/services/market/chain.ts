import { and, asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { ApiError } from "@/lib/error";

const numeric = (value: string | null): number | null =>
  value === null ? null : Number.parseFloat(value);

export const getSnapshotMeta = async (snapshotId: string) => {
  const [row] = await db
    .select({
      id: schema.snapshot.id,
      tradeDate: schema.snapshot.tradeDate,
      underlyingPrice: schema.snapshot.underlyingPrice,
      rate: schema.snapshot.rate,
      status: schema.snapshot.status,
      ticker: schema.symbol.ticker,
      dividendYield: schema.symbol.dividendYield,
    })
    .from(schema.snapshot)
    .innerJoin(schema.symbol, eq(schema.snapshot.symbolId, schema.symbol.id))
    .where(eq(schema.snapshot.id, snapshotId))
    .limit(1);

  if (row === undefined || row.status !== "ok") {
    throw new ApiError("NOT_FOUND", "Snapshot not found.");
  }

  return {
    id: row.id,
    ticker: row.ticker,
    tradeDate: row.tradeDate,
    underlyingPrice: numeric(row.underlyingPrice),
    rate: Number.parseFloat(row.rate),
    dividendYield: Number.parseFloat(row.dividendYield),
  };
};

/** full chain for a snapshot, grouped by expiry. reads stored rows, never computes. */
export const getChain = async (snapshotId: string, expiration?: string) => {
  const meta = await getSnapshotMeta(snapshotId);

  const where =
    expiration === undefined
      ? eq(schema.contract.snapshotId, snapshotId)
      : and(eq(schema.contract.snapshotId, snapshotId), eq(schema.contract.expiration, expiration));

  const rows = await db
    .select({
      contractId: schema.contract.contractId,
      type: schema.contract.type,
      strike: schema.contract.strike,
      expiration: schema.contract.expiration,
      bid: schema.contract.bid,
      ask: schema.contract.ask,
      last: schema.contract.last,
      mark: schema.contract.mark,
      volume: schema.contract.volume,
      openInterest: schema.contract.openInterest,
      vendorIv: schema.contract.vendorIv,
      computedIv: schema.contract.computedIv,
      computedDelta: schema.contract.computedDelta,
      computedGamma: schema.contract.computedGamma,
      computedTheta: schema.contract.computedTheta,
      computedVega: schema.contract.computedVega,
      computedRho: schema.contract.computedRho,
      ivConverged: schema.contract.ivConverged,
    })
    .from(schema.contract)
    .where(where)
    .orderBy(asc(schema.contract.expiration), asc(schema.contract.strike));

  const byExpiry = new Map<string, ReturnType<typeof toChainRow>[]>();
  for (const row of rows) {
    const bucket = byExpiry.get(row.expiration) ?? [];
    bucket.push(toChainRow(row));
    byExpiry.set(row.expiration, bucket);
  }

  return {
    snapshot: meta,
    expirations: [...byExpiry.entries()].map(([expiry, contracts]) => ({
      expiration: expiry,
      contracts,
    })),
  };
};

type ContractRow = {
  contractId: string;
  type: "call" | "put";
  strike: string;
  expiration: string;
  bid: string | null;
  ask: string | null;
  last: string | null;
  mark: string | null;
  volume: number | null;
  openInterest: number | null;
  vendorIv: string | null;
  computedIv: string | null;
  computedDelta: string | null;
  computedGamma: string | null;
  computedTheta: string | null;
  computedVega: string | null;
  computedRho: string | null;
  ivConverged: boolean | null;
};

const toChainRow = (row: ContractRow) => ({
  contractId: row.contractId,
  type: row.type,
  strike: Number.parseFloat(row.strike),
  bid: numeric(row.bid),
  ask: numeric(row.ask),
  last: numeric(row.last),
  mark: numeric(row.mark),
  volume: row.volume,
  openInterest: row.openInterest,
  vendorIv: numeric(row.vendorIv),
  computedIv: numeric(row.computedIv),
  greeks: {
    delta: numeric(row.computedDelta),
    gamma: numeric(row.computedGamma),
    theta: numeric(row.computedTheta),
    vega: numeric(row.computedVega),
    rho: numeric(row.computedRho),
  },
  ivConverged: row.ivConverged,
});

/** cached arbitrage-free fit for the 3D view. computed at ingest, read here. */
export const getSurface = async (snapshotId: string) => {
  const meta = await getSnapshotMeta(snapshotId);

  const [row] = await db
    .select({
      slices: schema.surfaceFit.slices,
      grid: schema.surfaceFit.grid,
      calendarArbFree: schema.surfaceFit.calendarArbFree,
      skippedExpirations: schema.surfaceFit.skippedExpirations,
      computedAt: schema.surfaceFit.computedAt,
    })
    .from(schema.surfaceFit)
    .where(eq(schema.surfaceFit.snapshotId, snapshotId))
    .limit(1);

  if (row === undefined) {
    throw new ApiError("NOT_FOUND", "No surface fit for this snapshot.");
  }

  return { snapshot: meta, ...row };
};
