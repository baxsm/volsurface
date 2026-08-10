import { and, desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { newId } from "@/lib/id";

/** symbols the app tracks, with the dividend yield used to price them */
const TRACKED: { ticker: string; name: string; dividendYield: number }[] = [
  // 1% recovered from the chain's own quotes by sweeping q against its IVs,
  // which matches IBM's actual yield
  { ticker: "IBM", name: "International Business Machines", dividendYield: 0.01 },
];

export const seedSymbols = async (): Promise<void> => {
  for (const entry of TRACKED) {
    await db
      .insert(schema.symbol)
      .values({
        id: newId(),
        ticker: entry.ticker,
        name: entry.name,
        dividendYield: String(entry.dividendYield),
      })
      .onConflictDoUpdate({
        target: schema.symbol.ticker,
        set: { name: entry.name, dividendYield: String(entry.dividendYield) },
      });
  }
};

export const listSymbols = async () => {
  const rows = await db
    .select({
      ticker: schema.symbol.ticker,
      name: schema.symbol.name,
      active: schema.symbol.active,
    })
    .from(schema.symbol)
    .where(eq(schema.symbol.active, true))
    .orderBy(schema.symbol.ticker);

  return rows;
};

export const listSnapshots = async (ticker: string) => {
  const rows = await db
    .select({
      id: schema.snapshot.id,
      tradeDate: schema.snapshot.tradeDate,
      underlyingPrice: schema.snapshot.underlyingPrice,
      contractCount: schema.snapshot.contractCount,
    })
    .from(schema.snapshot)
    .innerJoin(schema.symbol, eq(schema.snapshot.symbolId, schema.symbol.id))
    .where(and(eq(schema.symbol.ticker, ticker.toUpperCase()), eq(schema.snapshot.status, "ok")))
    .orderBy(desc(schema.snapshot.tradeDate));

  // postgres numeric arrives as a string. the api returns numbers so the client
  // never has to guess which fields need parsing.
  return rows.map((row) => ({
    ...row,
    underlyingPrice: row.underlyingPrice === null ? null : Number.parseFloat(row.underlyingPrice),
  }));
};
