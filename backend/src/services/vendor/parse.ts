import { z } from "zod";
import type { VendorContract } from "./types";

// alpha vantage sends every field as a string, including numbers, and uses ""
// or "None" for missing values. parsing is shared between the live adapter and
// the fixture adapter so both produce identical rows from identical bytes.

const numeric = z
  .string()
  .transform((raw) => {
    const trimmed = raw.trim();
    if (trimmed === "" || trimmed.toLowerCase() === "none") return null;
    const value = Number.parseFloat(trimmed);
    return Number.isFinite(value) ? value : null;
  })
  .nullable()
  .catch(null);

const required = z.string().transform((raw) => Number.parseFloat(raw));

export const vendorRowSchema = z.object({
  contractID: z.string().min(1),
  symbol: z.string().min(1),
  expiration: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expiration must be YYYY-MM-DD"),
  strike: required,
  type: z.enum(["call", "put"]),
  last: numeric.optional(),
  mark: numeric.optional(),
  bid: numeric.optional(),
  ask: numeric.optional(),
  volume: numeric.optional(),
  open_interest: numeric.optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD"),
  implied_volatility: numeric.optional(),
  delta: numeric.optional(),
  gamma: numeric.optional(),
  theta: numeric.optional(),
  vega: numeric.optional(),
  rho: numeric.optional(),
});

export const vendorPayloadSchema = z.object({
  endpoint: z.string().optional(),
  message: z.string().optional(),
  data: z.array(vendorRowSchema),
});

export type VendorRow = z.infer<typeof vendorRowSchema>;

const toInt = (value: number | null | undefined): number | null =>
  value === null || value === undefined ? null : Math.trunc(value);

export const toContract = (row: VendorRow): VendorContract => ({
  contractId: row.contractID,
  type: row.type,
  strike: row.strike,
  expiration: row.expiration,
  bid: row.bid ?? null,
  ask: row.ask ?? null,
  last: row.last ?? null,
  mark: row.mark ?? null,
  volume: toInt(row.volume),
  openInterest: toInt(row.open_interest),
  vendorIv: row.implied_volatility ?? null,
  vendorDelta: row.delta ?? null,
  vendorGamma: row.gamma ?? null,
  vendorTheta: row.theta ?? null,
  vendorVega: row.vega ?? null,
  vendorRho: row.rho ?? null,
});
