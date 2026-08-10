import type { VendorContract } from "../vendor/types";

const YEAR_MS = 365 * 24 * 3600 * 1000;

/** time to expiry in years from a trade date, both YYYY-MM-DD */
export const yearsBetween = (tradeDate: string, expiration: string): number =>
  (Date.parse(`${expiration}T00:00:00Z`) - Date.parse(`${tradeDate}T00:00:00Z`)) / YEAR_MS;

/**
 * the vendor payload carries no underlying price, so recover it from put-call
 * parity: C - P = S*e^(-qT) - K*e^(-rT).
 *
 * the parity residual is smallest where the two legs are closest in value, so
 * this takes the tightest call-put pair per expiry rather than averaging the
 * chain - deep wings are dominated by spread noise and drag the estimate off.
 * the front expiry is then used because it carries the least dividend
 * contamination: on the IBM chain, solving with q folded in makes the apparent
 * spot decay from 213.08 at four days to 201.05 at 2.4 years.
 */
export const impliedSpot = (
  contracts: VendorContract[],
  tradeDate: string,
  rate: number,
  dividendYield: number,
): number | null => {
  const pairs = new Map<string, { call?: number; put?: number; strike: number; t: number }>();

  for (const row of contracts) {
    const t = yearsBetween(tradeDate, row.expiration);
    const mark = row.mark;
    if (!(t > 0) || mark === null || !(mark > 0)) continue;

    const key = `${row.expiration}:${row.strike}`;
    const entry = pairs.get(key) ?? { strike: row.strike, t };
    if (row.type === "call") entry.call = mark;
    else entry.put = mark;
    pairs.set(key, entry);
  }

  const bestPerExpiry = new Map<string, { gap: number; spot: number; t: number }>();
  for (const [key, { call, put, strike, t }] of pairs) {
    if (call === undefined || put === undefined) continue;
    const expiry = key.split(":")[0] ?? "";
    const gap = Math.abs(call - put);
    const current = bestPerExpiry.get(expiry);
    if (current === undefined || gap < current.gap) {
      // C - P = S*e^(-qT) - K*e^(-rT), solved for S
      const forwardValue = call - put + strike * Math.exp(-rate * t);
      bestPerExpiry.set(expiry, { gap, t, spot: forwardValue * Math.exp(dividendYield * t) });
    }
  }

  const front = [...bestPerExpiry.values()].sort((a, b) => a.t - b.t)[0];
  return front?.spot ?? null;
};

/** forward price under continuous carry, which log-moneyness is measured against */
export const forwardPrice = (
  spot: number,
  rate: number,
  dividendYield: number,
  t: number,
): number => spot * Math.exp((rate - dividendYield) * t);
