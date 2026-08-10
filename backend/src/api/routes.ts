import { Hono } from "hono";
import type { z } from "zod";
import { ApiError, handle } from "@/lib/error";
import { getChain, getSurface } from "@/services/market/chain";
import { listSnapshots, listSymbols } from "@/services/market/symbols";
import { computePayoff, priceAmerican, priceEuropean, solveImpliedVol } from "@/services/pricing";
import {
  createStrategy,
  deleteStrategy,
  getStrategy,
  listStrategies,
  updateStrategy,
} from "@/services/strategies";
import { type AppEnv, currentUser, rateLimit, requireAuth } from "./middleware";
import {
  americanPriceSchema,
  expirationSchema,
  idSchema,
  impliedVolSchema,
  optionInputSchema,
  payoffSchema,
  strategyCreateSchema,
  strategyUpdateSchema,
  tickerSchema,
} from "./validation";

/** parses a body and turns a zod failure into a 400 with the first real message */
const parse = async <T>(c: { req: { json: () => Promise<unknown> } }, schema: z.ZodType<T>) => {
  const body = await c.req.json().catch(() => {
    throw new ApiError("BAD_REQUEST", "Body must be valid JSON.");
  });

  const result = schema.safeParse(body);
  if (!result.success) {
    const issue = result.error.issues[0];
    const path = issue?.path.join(".") ?? "";
    throw new ApiError(
      "BAD_REQUEST",
      path === "" ? (issue?.message ?? "Invalid input.") : `${path}: ${issue?.message}`,
    );
  }
  return result.data;
};

const parseParam = <T>(value: string | undefined, schema: z.ZodType<T>, label: string): T => {
  const result = schema.safeParse(value);
  if (!result.success) throw new ApiError("BAD_REQUEST", `Invalid ${label}.`);
  return result.data;
};

// compute endpoints run the engine, so they carry the tighter limit. reads are
// cheap indexed lookups and get a looser one.
const computeLimit = rateLimit({ limit: 60, windowMs: 60_000 });
const readLimit = rateLimit({ limit: 240, windowMs: 60_000 });
const writeLimit = rateLimit({ limit: 60, windowMs: 60_000 });

export const api = new Hono<AppEnv>();

api.get(
  "/symbols",
  readLimit,
  handle("symbols.list", async (c) => c.json({ symbols: await listSymbols() })),
);

api.get(
  "/symbols/:ticker/snapshots",
  readLimit,
  handle("symbols.snapshots", async (c) => {
    const ticker = parseParam(c.req.param("ticker"), tickerSchema, "ticker");
    return c.json({ ticker, snapshots: await listSnapshots(ticker) });
  }),
);

api.get(
  "/snapshots/:id/chain",
  readLimit,
  handle("snapshots.chain", async (c) => {
    const id = parseParam(c.req.param("id"), idSchema, "snapshot id");
    const raw = c.req.query("expiration");
    const expiration =
      raw === undefined ? undefined : parseParam(raw, expirationSchema, "expiration");
    return c.json(await getChain(id, expiration));
  }),
);

api.get(
  "/snapshots/:id/surface",
  readLimit,
  handle("snapshots.surface", async (c) => {
    const id = parseParam(c.req.param("id"), idSchema, "snapshot id");
    return c.json(await getSurface(id));
  }),
);

api.post(
  "/price/american",
  computeLimit,
  handle("price.american", async (c) => c.json(priceAmerican(await parse(c, americanPriceSchema)))),
);

api.post(
  "/price/european",
  computeLimit,
  handle("price.european", async (c) => c.json(priceEuropean(await parse(c, optionInputSchema)))),
);

api.post(
  "/price/iv",
  computeLimit,
  handle("price.iv", async (c) => c.json(solveImpliedVol(await parse(c, impliedVolSchema)))),
);

api.post(
  "/strategy/payoff",
  computeLimit,
  handle("strategy.payoff", async (c) => c.json(computePayoff(await parse(c, payoffSchema)))),
);

api.get(
  "/strategies",
  readLimit,
  requireAuth,
  handle("strategies.list", async (c) => {
    const user = currentUser(c);
    return c.json({ strategies: await listStrategies(user.id) });
  }),
);

api.post(
  "/strategies",
  writeLimit,
  requireAuth,
  handle("strategies.create", async (c) => {
    const user = currentUser(c);
    const input = await parse(c, strategyCreateSchema);
    return c.json(await createStrategy(user.id, input), 201);
  }),
);

api.get(
  "/strategies/:id",
  readLimit,
  requireAuth,
  handle("strategies.get", async (c) => {
    const user = currentUser(c);
    const id = parseParam(c.req.param("id"), idSchema, "strategy id");
    return c.json(await getStrategy(user.id, id));
  }),
);

api.put(
  "/strategies/:id",
  writeLimit,
  requireAuth,
  handle("strategies.update", async (c) => {
    const user = currentUser(c);
    const id = parseParam(c.req.param("id"), idSchema, "strategy id");
    const input = await parse(c, strategyUpdateSchema);
    return c.json(await updateStrategy(user.id, id, input));
  }),
);

api.delete(
  "/strategies/:id",
  writeLimit,
  requireAuth,
  handle("strategies.delete", async (c) => {
    const user = currentUser(c);
    const id = parseParam(c.req.param("id"), idSchema, "strategy id");
    await deleteStrategy(user.id, id);
    return c.body(null, 204);
  }),
);
