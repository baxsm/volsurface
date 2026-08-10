import type { SurfaceFitResult, SviQuote, SviSliceInput } from "../types";
import { enforceCalendar } from "./calendar";
import { buildSurfaceGrid, type GridOptions } from "./grid";
import { fitSviSlice, type SviFitOptions } from "./svi";

export interface FitSurfaceOptions extends SviFitOptions, GridOptions {}

/**
 * fit a whole surface: one SVI slice per expiry, then a calendar no-cross pass
 * across the term structure, then a sampled mesh for rendering.
 *
 * expiries whose quote cloud is too thin to fit are dropped rather than
 * interpolated, so the surface only shows expiries the market actually priced.
 */
export const fitSurface = (
  inputs: SviSliceInput[],
  options: FitSurfaceOptions = {},
): SurfaceFitResult => {
  const fitted = inputs
    .map((input) => fitSviSlice(input.expiration, input.t, input.quotes, options))
    .filter((slice) => slice !== null);

  const skipped = inputs
    .filter((input) => !fitted.some((slice) => slice.expiration === input.expiration))
    .map((input) => input.expiration);

  if (fitted.length === 0) {
    return {
      slices: [],
      grid: { moneyness: [], expiries: [], years: [], strikes: [], iv: [] },
      calendarArbFree: true,
      crossings: [],
      skippedExpirations: skipped,
    };
  }

  const { slices, calendarArbFree, crossings } = enforceCalendar(fitted);

  const forwards = new Map<string, number>();
  for (const input of inputs) {
    forwards.set(input.expiration, input.forward);
  }

  return {
    slices,
    grid: buildSurfaceGrid(slices, forwards, options),
    calendarArbFree,
    crossings,
    skippedExpirations: skipped,
  };
};

/** build the per-quote inputs the fit expects from raw chain rows */
export const toSviQuote = (
  strike: number,
  forward: number,
  iv: number,
  t: number,
  weight = 1,
): SviQuote | null => {
  if (!(strike > 0) || !(forward > 0) || !(iv > 0) || !(t > 0)) return null;
  return { k: Math.log(strike / forward), w: iv * iv * t, weight };
};

export type { CalendarCrossing, CalendarResult } from "./calendar";
export { enforceCalendar, liftToDominate, sharedKGrid, worstCrossing } from "./calendar";
export type { GridOptions } from "./grid";
export { buildSurfaceGrid } from "./grid";
export type {
  FilteredQuote,
  QuoteFilterOptions,
  QuoteFilterResult,
  RawQuote,
} from "./quotes";
export { filterQuotes } from "./quotes";
export type { SviFitOptions } from "./svi";
export {
  butterflyViolations,
  fitSviSlice,
  isButterflyArbFree,
  MIN_QUOTES_PER_SLICE,
  projectToArbFree,
  sviImpliedVol,
  sviTotalVariance,
} from "./svi";
