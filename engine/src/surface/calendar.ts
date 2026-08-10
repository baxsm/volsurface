import type { SviSliceFit } from "../types";
import { projectToArbFree, sviTotalVariance } from "./svi";

/**
 * calendar no-arb: total variance must be non-decreasing in maturity at every
 * log-moneyness. w(k, T1) <= w(k, T2) for T1 < T2. crossing slices imply a
 * negative forward variance, which shows up in the rendered surface as a fold.
 */

/** how many points the no-cross check samples across the shared range */
const CHECK_K_STEPS = 121;

/**
 * the k window two slices are compared over: the overlap of the ranges their
 * quotes actually covered.
 *
 * comparing over a fixed wide grid instead is what makes this go wrong. SVI
 * wings are linear extrapolations, so two slices will always eventually cross
 * far from the money, in a region neither slice has data for. lifting a slice
 * by that fictitious gap then wrecks the fit where the data does exist - it
 * pushed IBM's 6-month ATM vol from 0.5 to 2.4 in testing.
 */
export const sharedKGrid = (earlier: SviSliceFit, later: SviSliceFit): number[] => {
  const lo = Math.max(earlier.kMin, later.kMin);
  const hi = Math.min(earlier.kMax, later.kMax);
  if (!(hi > lo)) return [];

  const ks: number[] = [];
  const width = hi - lo;
  for (let i = 0; i < CHECK_K_STEPS; i++) {
    ks.push(lo + (width * i) / (CHECK_K_STEPS - 1));
  }
  return ks;
};

export interface CalendarCrossing {
  earlierExpiration: string;
  laterExpiration: string;
  /** log-moneyness where the worst crossing occurs */
  k: number;
  /** how much the later slice dips below the earlier one, in total variance */
  gap: number;
}

/** worst crossing between two slices over their shared support, or null when they never cross */
export const worstCrossing = (
  earlier: SviSliceFit,
  later: SviSliceFit,
  ks: number[] = sharedKGrid(earlier, later),
): CalendarCrossing | null => {
  let worst: CalendarCrossing | null = null;

  for (const k of ks) {
    const gap = sviTotalVariance(earlier.params, k) - sviTotalVariance(later.params, k);
    if (gap > 1e-12 && (worst === null || gap > worst.gap)) {
      worst = { earlierExpiration: earlier.expiration, laterExpiration: later.expiration, k, gap };
    }
  }

  return worst;
};

/**
 * lift a later slice so it dominates the earlier one across their shared range.
 * raising `a` shifts total variance up uniformly, which is the least invasive
 * repair: it preserves the fitted skew and wing shape and cannot break the
 * butterfly conditions, since a only has to stay above a lower bound.
 */
export const liftToDominate = (
  earlier: SviSliceFit,
  later: SviSliceFit,
  ks: number[] = sharedKGrid(earlier, later),
): SviSliceFit => {
  const crossing = worstCrossing(earlier, later, ks);
  if (crossing === null) return later;

  const lifted = projectToArbFree({ ...later.params, a: later.params.a + crossing.gap });
  return { ...later, params: lifted, calendarRepaired: true };
};

export interface CalendarResult {
  slices: SviSliceFit[];
  calendarArbFree: boolean;
  /** crossings found before repair, kept so ingestion can log what was adjusted */
  crossings: CalendarCrossing[];
}

/**
 * enforce calendar no-cross across the whole term structure, earliest first.
 * each slice is lifted to dominate the one before it, so a single repair
 * propagates forward instead of leaving a later pair still crossing.
 */
export const enforceCalendar = (input: SviSliceFit[]): CalendarResult => {
  const sorted = [...input].sort((x, y) => x.t - y.t);
  const crossings: CalendarCrossing[] = [];
  const slices: SviSliceFit[] = [];

  for (const slice of sorted) {
    const previous = slices[slices.length - 1];
    if (previous === undefined) {
      slices.push(slice);
      continue;
    }

    const crossing = worstCrossing(previous, slice);
    if (crossing === null) {
      slices.push(slice);
      continue;
    }

    crossings.push(crossing);
    slices.push(liftToDominate(previous, slice));
  }

  // re-check after repair rather than assuming the lift worked
  let arbFree = true;
  for (let i = 1; i < slices.length; i++) {
    const previous = slices[i - 1];
    const current = slices[i];
    if (previous === undefined || current === undefined) continue;
    if (worstCrossing(previous, current) !== null) arbFree = false;
  }

  return { slices, calendarArbFree: arbFree, crossings };
};
