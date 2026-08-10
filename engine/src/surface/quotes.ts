import type { SviQuote } from "../types";

/**
 * turning a raw chain into fittable quotes.
 *
 * this is where most of the surface quality is decided. a real chain is mostly
 * contracts nobody trades: the wings are full of one-cent marks that are the
 * minimum tick rather than a price. inverting those produces an implied vol
 * that looks plausible and means nothing, and because they sit far from the
 * money they pull the fitted skew hard. filtering them is not cosmetic - on
 * the IBM chain, letting them through flipped rho positive on a third of the
 * expiries, which is the wrong sign for equity skew.
 */

export interface RawQuote {
  strike: number;
  /** mid or mark price of the contract */
  mark: number;
  bid: number;
  ask: number;
  volume: number;
  openInterest: number;
  /** solved implied vol for this contract, or null when no vol reproduces the mark */
  iv: number | null;
}

export interface QuoteFilterOptions {
  /** marks at or below this are treated as a tick, not a price. defaults to 0.05 */
  minMark?: number;
  /** drop quotes with no volume and open interest below this. defaults to 10 */
  minOpenInterest?: number;
  /** drop quotes whose relative spread exceeds this. defaults to 0.75 */
  maxRelativeSpread?: number;
}

export interface FilteredQuote extends SviQuote {
  strike: number;
  iv: number;
}

export interface QuoteFilterResult {
  quotes: FilteredQuote[];
  /** why each dropped contract was dropped, for ingestion to log */
  dropped: { penny: number; illiquid: number; wideSpread: number; unsolved: number };
}

/**
 * select and weight the quotes for one expiry.
 *
 * weight is 1/(1+relativeSpread^2), so a tight two-sided market counts for
 * roughly ten times a market quoted half its own value wide. that ratio is the
 * point: the fit should follow the strikes that were actually traded.
 */
export const filterQuotes = (
  raw: RawQuote[],
  forward: number,
  t: number,
  options: QuoteFilterOptions = {},
): QuoteFilterResult => {
  const minMark = options.minMark ?? 0.05;
  const minOpenInterest = options.minOpenInterest ?? 10;
  const maxRelativeSpread = options.maxRelativeSpread ?? 0.75;

  const quotes: FilteredQuote[] = [];
  const dropped = { penny: 0, illiquid: 0, wideSpread: 0, unsolved: 0 };

  for (const row of raw) {
    if (row.iv === null || !(row.iv > 0)) {
      dropped.unsolved++;
      continue;
    }
    if (!(row.mark > minMark)) {
      dropped.penny++;
      continue;
    }
    if (row.volume <= 0 && row.openInterest < minOpenInterest) {
      dropped.illiquid++;
      continue;
    }

    // a one-sided or crossed market has no meaningful width, so treat it as the
    // worst case rather than dividing by a bid that is not there
    const twoSided = row.ask > row.bid && row.bid > 0;
    const relativeSpread = twoSided ? (row.ask - row.bid) / row.mark : Number.POSITIVE_INFINITY;
    if (!(relativeSpread <= maxRelativeSpread)) {
      dropped.wideSpread++;
      continue;
    }

    if (!(row.strike > 0) || !(forward > 0) || !(t > 0)) {
      dropped.unsolved++;
      continue;
    }

    quotes.push({
      strike: row.strike,
      iv: row.iv,
      k: Math.log(row.strike / forward),
      w: row.iv * row.iv * t,
      weight: 1 / (1 + relativeSpread * relativeSpread),
    });
  }

  return { quotes, dropped };
};
