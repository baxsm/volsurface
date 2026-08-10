import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import {
  blackScholesGreeks,
  filterQuotes,
  fitSurface,
  impliedVol,
  type RawQuote,
  type SviSliceInput,
} from "@/engine";
import { ApiError } from "@/lib/error";
import { newId, stableId } from "@/lib/id";
import { logger } from "@/lib/logger";
import type { VendorAdapter, VendorContract } from "../vendor/types";
import { forwardPrice, impliedSpot, yearsBetween } from "./pricing-inputs";

// no rates feed is wired, so the risk-free rate is a stated assumption rather
// than a measurement. it is stored on each snapshot so the greeks that were
// computed under it stay reproducible if this default later changes.
export const ASSUMED_RATE = 0.04;

/** contracts are written in batches so one chain does not become a single huge statement */
const INSERT_BATCH = 500;

export interface IngestResult {
  snapshotId: string;
  ticker: string;
  tradeDate: string;
  contractCount: number;
  solvedCount: number;
  underlyingPrice: number | null;
  fittedExpirations: number;
  skippedExpirations: string[];
  calendarArbFree: boolean;
}

const toNumeric = (value: number | null): string | null =>
  value === null || !Number.isFinite(value) ? null : String(value);

/**
 * pull one chain and store it: snapshot row, every contract with our own
 * solved IV and greeks alongside the vendor's, then the arbitrage-free surface
 * fit cached so the request path never re-fits.
 */
export const ingestChain = async (
  adapter: VendorAdapter,
  ticker: string,
  tradeDate?: string,
): Promise<IngestResult> => {
  const upper = ticker.toUpperCase();

  const [symbolRow] = await db
    .select({ id: schema.symbol.id, dividendYield: schema.symbol.dividendYield })
    .from(schema.symbol)
    .where(eq(schema.symbol.ticker, upper))
    .limit(1);

  if (symbolRow === undefined) {
    throw new ApiError("NOT_FOUND", `${upper} is not a tracked symbol.`);
  }

  const chain = await adapter.fetchChain(upper, tradeDate);
  const dividendYield = Number.parseFloat(symbolRow.dividendYield);
  const spot = impliedSpot(chain.contracts, chain.tradeDate, ASSUMED_RATE, dividendYield);

  if (spot === null) {
    throw new ApiError("INTERNAL", `Could not recover an underlying price for ${upper}.`);
  }

  const snapshotId = await upsertSnapshot({
    symbolId: symbolRow.id,
    tradeDate: chain.tradeDate,
    source: adapter.id,
    spot,
    contractCount: chain.contracts.length,
  });

  const { rows, solvedCount, byExpiry } = solveChain(chain.contracts, {
    tradeDate: chain.tradeDate,
    spot,
    dividendYield,
    snapshotId,
  });

  await replaceContracts(snapshotId, rows);

  const surface = fitSurface(buildSliceInputs(byExpiry, chain.tradeDate, spot, dividendYield));
  await replaceSurfaceFit(snapshotId, surface);

  await db
    .update(schema.snapshot)
    .set({ status: "ok", contractCount: rows.length })
    .where(eq(schema.snapshot.id, snapshotId));

  if (surface.crossings.length > 0) {
    logger.info(
      "market.ingest",
      `${upper} ${chain.tradeDate}: lifted ${surface.crossings.length} crossing slices`,
    );
  }

  return {
    snapshotId,
    ticker: upper,
    tradeDate: chain.tradeDate,
    contractCount: rows.length,
    solvedCount,
    underlyingPrice: spot,
    fittedExpirations: surface.slices.length,
    skippedExpirations: surface.skippedExpirations,
    calendarArbFree: surface.calendarArbFree,
  };
};

const upsertSnapshot = async (input: {
  symbolId: string;
  tradeDate: string;
  source: string;
  spot: number;
  contractCount: number;
}): Promise<string> => {
  const [row] = await db
    .insert(schema.snapshot)
    .values({
      id: newId(),
      symbolId: input.symbolId,
      tradeDate: input.tradeDate,
      underlyingPrice: String(input.spot),
      rate: String(ASSUMED_RATE),
      status: "pending",
      source: input.source,
      contractCount: input.contractCount,
    })
    .onConflictDoUpdate({
      target: [schema.snapshot.symbolId, schema.snapshot.tradeDate],
      set: {
        underlyingPrice: String(input.spot),
        rate: String(ASSUMED_RATE),
        status: "pending",
        source: input.source,
        contractCount: input.contractCount,
        fetchedAt: new Date(),
      },
    })
    .returning({ id: schema.snapshot.id });

  if (row === undefined) throw new ApiError("INTERNAL", "Could not write the snapshot.");
  return row.id;
};

type ContractInsert = typeof schema.contract.$inferInsert;

const solveChain = (
  contracts: VendorContract[],
  context: { tradeDate: string; spot: number; dividendYield: number; snapshotId: string },
): { rows: ContractInsert[]; solvedCount: number; byExpiry: Map<string, RawQuote[]> } => {
  const rows: ContractInsert[] = [];
  const byExpiry = new Map<string, RawQuote[]>();
  let solvedCount = 0;

  for (const row of contracts) {
    const t = yearsBetween(context.tradeDate, row.expiration);
    const mark = row.mark;

    let iv: number | null = null;
    let converged = false;
    let greeks: ReturnType<typeof blackScholesGreeks> | null = null;

    if (t > 0 && mark !== null && mark > 0 && row.strike > 0) {
      const inputs = {
        type: row.type,
        S: context.spot,
        K: row.strike,
        r: ASSUMED_RATE,
        T: t,
        q: context.dividendYield,
      };
      const solved = impliedVol({ ...inputs, price: mark });
      iv = solved.iv;
      converged = solved.converged;
      if (iv !== null) {
        solvedCount++;
        greeks = blackScholesGreeks({ ...inputs, sigma: iv });
      }
    }

    rows.push({
      // stable so re-ingesting the same chain updates rows instead of duplicating
      id: stableId(context.snapshotId, row.contractId),
      snapshotId: context.snapshotId,
      contractId: row.contractId,
      type: row.type,
      strike: String(row.strike),
      expiration: row.expiration,
      bid: toNumeric(row.bid),
      ask: toNumeric(row.ask),
      last: toNumeric(row.last),
      mark: toNumeric(row.mark),
      volume: row.volume,
      openInterest: row.openInterest,
      vendorIv: toNumeric(row.vendorIv),
      vendorDelta: toNumeric(row.vendorDelta),
      vendorGamma: toNumeric(row.vendorGamma),
      vendorTheta: toNumeric(row.vendorTheta),
      vendorVega: toNumeric(row.vendorVega),
      vendorRho: toNumeric(row.vendorRho),
      computedIv: toNumeric(iv),
      computedDelta: toNumeric(greeks?.delta ?? null),
      computedGamma: toNumeric(greeks?.gamma ?? null),
      computedTheta: toNumeric(greeks?.theta ?? null),
      computedVega: toNumeric(greeks?.vega ?? null),
      computedRho: toNumeric(greeks?.rho ?? null),
      ivConverged: converged,
    });

    // only the out-of-the-money leg feeds the surface: the in-the-money leg is
    // mostly intrinsic value, so its implied vol is dominated by spread noise
    if (t > 0 && mark !== null) {
      const forward = forwardPrice(context.spot, ASSUMED_RATE, context.dividendYield, t);
      const otm = row.type === "call" ? row.strike >= forward : row.strike < forward;
      if (otm) {
        const bucket = byExpiry.get(row.expiration) ?? [];
        bucket.push({
          strike: row.strike,
          mark,
          bid: row.bid ?? 0,
          ask: row.ask ?? 0,
          volume: row.volume ?? 0,
          openInterest: row.openInterest ?? 0,
          iv,
        });
        byExpiry.set(row.expiration, bucket);
      }
    }
  }

  return { rows, solvedCount, byExpiry };
};

const buildSliceInputs = (
  byExpiry: Map<string, RawQuote[]>,
  tradeDate: string,
  spot: number,
  dividendYield: number,
): SviSliceInput[] =>
  [...byExpiry.entries()]
    .map(([expiration, raw]) => {
      const t = yearsBetween(tradeDate, expiration);
      const forward = forwardPrice(spot, ASSUMED_RATE, dividendYield, t);
      return { expiration, t, forward, quotes: filterQuotes(raw, forward, t).quotes };
    })
    .sort((a, b) => a.t - b.t);

const replaceContracts = async (snapshotId: string, rows: ContractInsert[]): Promise<void> => {
  // a re-ingest may return fewer contracts than before, so clear first rather
  // than upserting and leaving rows from the previous pull behind
  await db.delete(schema.contract).where(eq(schema.contract.snapshotId, snapshotId));

  for (let i = 0; i < rows.length; i += INSERT_BATCH) {
    await db.insert(schema.contract).values(rows.slice(i, i + INSERT_BATCH));
  }
};

const replaceSurfaceFit = async (
  snapshotId: string,
  surface: ReturnType<typeof fitSurface>,
): Promise<void> => {
  await db
    .insert(schema.surfaceFit)
    .values({
      id: newId(),
      snapshotId,
      slices: surface.slices,
      grid: surface.grid,
      calendarArbFree: surface.calendarArbFree,
      skippedExpirations: surface.skippedExpirations,
    })
    .onConflictDoUpdate({
      target: schema.surfaceFit.snapshotId,
      set: {
        slices: surface.slices,
        grid: surface.grid,
        calendarArbFree: surface.calendarArbFree,
        skippedExpirations: surface.skippedExpirations,
        computedAt: new Date(),
      },
    });
};
