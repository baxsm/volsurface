import { and, asc, desc, eq } from "drizzle-orm";
import type { LegInput, StrategyCreateInput, StrategyUpdateInput } from "@/api/validation";
import { db, schema } from "@/db";
import { ApiError } from "@/lib/error";
import { newId } from "@/lib/id";

/**
 * every read and write filters on userId in this layer, not in the controller.
 * a missing row and someone else's row both surface as NOT_FOUND: returning
 * FORBIDDEN would confirm the id exists, which is a membership oracle.
 */

const numeric = (value: string | null): number | null =>
  value === null ? null : Number.parseFloat(value);

const resolveSymbolId = async (ticker?: string): Promise<string | null> => {
  if (ticker === undefined) return null;
  const [row] = await db
    .select({ id: schema.symbol.id })
    .from(schema.symbol)
    .where(eq(schema.symbol.ticker, ticker))
    .limit(1);
  if (row === undefined) throw new ApiError("BAD_REQUEST", `${ticker} is not a tracked symbol.`);
  return row.id;
};

const legRows = (strategyId: string, legs: LegInput[]) =>
  legs.map((leg) => ({
    id: newId(),
    strategyId,
    action: leg.action,
    // stock legs have no strike or expiration, but both columns are notNull.
    // storing 0 and the epoch would read as real data downstream, so stock
    // legs are rejected at the boundary instead - saved strategies are options.
    type: leg.type === "stock" ? ("call" as const) : leg.type,
    strike: String(leg.strike ?? 0),
    expiration: leg.expiration ?? "",
    quantity: leg.quantity,
    entryPrice: String(leg.entryPrice),
  }));

const assertNoStockLegs = (legs: LegInput[]): void => {
  if (legs.some((leg) => leg.type === "stock")) {
    throw new ApiError("BAD_REQUEST", "Saved strategies support option legs only.");
  }
  if (legs.some((leg) => leg.expiration === undefined)) {
    throw new ApiError("BAD_REQUEST", "Every leg needs an expiration.");
  }
};

export const listStrategies = async (userId: string) =>
  db
    .select({
      id: schema.strategy.id,
      name: schema.strategy.name,
      kind: schema.strategy.kind,
      notes: schema.strategy.notes,
      createdAt: schema.strategy.createdAt,
      updatedAt: schema.strategy.updatedAt,
    })
    .from(schema.strategy)
    .where(eq(schema.strategy.userId, userId))
    .orderBy(desc(schema.strategy.updatedAt));

export const getStrategy = async (userId: string, id: string) => {
  const [row] = await db
    .select({
      id: schema.strategy.id,
      name: schema.strategy.name,
      kind: schema.strategy.kind,
      notes: schema.strategy.notes,
      ticker: schema.symbol.ticker,
      createdAt: schema.strategy.createdAt,
      updatedAt: schema.strategy.updatedAt,
    })
    .from(schema.strategy)
    .leftJoin(schema.symbol, eq(schema.strategy.symbolId, schema.symbol.id))
    .where(and(eq(schema.strategy.id, id), eq(schema.strategy.userId, userId)))
    .limit(1);

  if (row === undefined) throw new ApiError("NOT_FOUND", "Strategy not found.");

  const legs = await db
    .select({
      action: schema.strategyLeg.action,
      type: schema.strategyLeg.type,
      strike: schema.strategyLeg.strike,
      expiration: schema.strategyLeg.expiration,
      quantity: schema.strategyLeg.quantity,
      entryPrice: schema.strategyLeg.entryPrice,
    })
    .from(schema.strategyLeg)
    .where(eq(schema.strategyLeg.strategyId, id))
    .orderBy(asc(schema.strategyLeg.expiration), asc(schema.strategyLeg.strike));

  return {
    ...row,
    legs: legs.map((leg) => ({
      action: leg.action,
      type: leg.type,
      strike: Number.parseFloat(leg.strike),
      expiration: leg.expiration,
      quantity: leg.quantity,
      entryPrice: numeric(leg.entryPrice),
    })),
  };
};

export const createStrategy = async (userId: string, input: StrategyCreateInput) => {
  assertNoStockLegs(input.legs);
  const symbolId = await resolveSymbolId(input.ticker);
  const id = newId();

  await db.transaction(async (tx) => {
    await tx.insert(schema.strategy).values({
      id,
      userId,
      name: input.name,
      kind: input.kind,
      symbolId,
      notes: input.notes ?? null,
    });
    await tx.insert(schema.strategyLeg).values(legRows(id, input.legs));
  });

  return getStrategy(userId, id);
};

export const updateStrategy = async (userId: string, id: string, input: StrategyUpdateInput) => {
  // confirms ownership before any write, and throws NOT_FOUND if it is not theirs
  await getStrategy(userId, id);
  if (input.legs !== undefined) assertNoStockLegs(input.legs);

  const symbolId = input.ticker === undefined ? undefined : await resolveSymbolId(input.ticker);

  await db.transaction(async (tx) => {
    await tx
      .update(schema.strategy)
      .set({
        ...(input.name === undefined ? {} : { name: input.name }),
        ...(input.kind === undefined ? {} : { kind: input.kind }),
        ...(input.notes === undefined ? {} : { notes: input.notes }),
        ...(symbolId === undefined ? {} : { symbolId }),
        updatedAt: new Date(),
      })
      .where(and(eq(schema.strategy.id, id), eq(schema.strategy.userId, userId)));

    if (input.legs !== undefined) {
      await tx.delete(schema.strategyLeg).where(eq(schema.strategyLeg.strategyId, id));
      await tx.insert(schema.strategyLeg).values(legRows(id, input.legs));
    }
  });

  return getStrategy(userId, id);
};

export const deleteStrategy = async (userId: string, id: string): Promise<void> => {
  const deleted = await db
    .delete(schema.strategy)
    .where(and(eq(schema.strategy.id, id), eq(schema.strategy.userId, userId)))
    .returning({ id: schema.strategy.id });

  if (deleted.length === 0) throw new ApiError("NOT_FOUND", "Strategy not found.");
};
