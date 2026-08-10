import { z } from "zod";
import { MAX_STEPS, MAX_VOL } from "@/engine";

// bounds exist because the pricing engine is a CPU surface. an unbounded step
// count or expiry lets one request pin a core, so every numeric input that
// drives a loop is capped at the boundary rather than inside the service.

const MAX_PRICE = 1_000_000;
const MAX_YEARS = 30;

export const tickerSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z][A-Z.-]{0,9}$/, "Ticker must be 1-10 letters.");

export const idSchema = z.string().trim().min(1).max(64);

export const expirationSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Expiration must be YYYY-MM-DD.");

const positivePrice = z.number().finite().gt(0).max(MAX_PRICE);
const rate = z.number().finite().gte(-1).lte(1);
const years = z.number().finite().gt(0).max(MAX_YEARS);

export const optionInputSchema = z
  .object({
    spot: positivePrice,
    strike: positivePrice,
    rate,
    dividendYield: rate.default(0),
    vol: z.number().finite().gt(0).max(MAX_VOL),
    expiryYears: years,
    type: z.enum(["call", "put"]),
  })
  .strict();

export const americanPriceSchema = optionInputSchema
  .extend({
    steps: z.number().int().min(2).max(MAX_STEPS).optional(),
  })
  .strict();

export const impliedVolSchema = z
  .object({
    spot: positivePrice,
    strike: positivePrice,
    rate,
    dividendYield: rate.default(0),
    marketPrice: positivePrice,
    expiryYears: years,
    type: z.enum(["call", "put"]),
  })
  .strict();

const MAX_LEGS = 12;
const MAX_QUANTITY = 10_000;
const MAX_PAYOFF_STEPS = 1000;

export const legSchema = z
  .object({
    action: z.enum(["buy", "sell"]),
    type: z.enum(["call", "put", "stock"]),
    strike: positivePrice.optional(),
    expiration: expirationSchema.optional(),
    quantity: z.number().int().min(1).max(MAX_QUANTITY).default(1),
    entryPrice: z.number().finite().gte(0).max(MAX_PRICE),
  })
  .strict()
  .refine((leg) => leg.type === "stock" || leg.strike !== undefined, {
    message: "Option legs need a strike.",
    path: ["strike"],
  });

export const payoffSchema = z
  .object({
    legs: z.array(legSchema).min(1).max(MAX_LEGS),
    spotRange: z
      .object({
        min: z.number().finite().gte(0).max(MAX_PRICE),
        max: positivePrice,
        steps: z.number().int().min(2).max(MAX_PAYOFF_STEPS).optional(),
      })
      .strict()
      .refine((range) => range.max > range.min, {
        message: "Range max must be greater than min.",
        path: ["max"],
      })
      .optional(),
  })
  .strict();

const MAX_NAME = 120;
const MAX_NOTES = 2000;

export const strategyCreateSchema = z
  .object({
    name: z.string().trim().min(1).max(MAX_NAME),
    kind: z.string().trim().min(1).max(60),
    ticker: tickerSchema.optional(),
    notes: z.string().trim().max(MAX_NOTES).optional(),
    legs: z.array(legSchema).min(1).max(MAX_LEGS),
  })
  .strict();

export const strategyUpdateSchema = strategyCreateSchema.partial().strict();

export type PayoffInput = z.infer<typeof payoffSchema>;
export type StrategyCreateInput = z.infer<typeof strategyCreateSchema>;
export type StrategyUpdateInput = z.infer<typeof strategyUpdateSchema>;
export type LegInput = z.infer<typeof legSchema>;
