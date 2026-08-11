// mirrors what the backend actually returns, verified against live responses.
// numerics arrive as numbers, not strings - the api parses them server-side.

export interface TrackedSymbol {
  ticker: string;
  name: string;
  active: boolean;
}

export interface SnapshotSummary {
  id: string;
  tradeDate: string;
  underlyingPrice: number | null;
  contractCount: number;
}

export interface SnapshotMeta {
  id: string;
  ticker: string;
  tradeDate: string;
  underlyingPrice: number | null;
  rate: number;
  dividendYield: number;
}

export interface Greeks {
  delta: number | null;
  gamma: number | null;
  theta: number | null;
  vega: number | null;
  rho: number | null;
}

export interface Contract {
  contractId: string;
  type: "call" | "put";
  strike: number;
  bid: number | null;
  ask: number | null;
  last: number | null;
  mark: number | null;
  volume: number | null;
  openInterest: number | null;
  vendorIv: number | null;
  computedIv: number | null;
  greeks: Greeks;
  ivConverged: boolean | null;
}

export interface ExpiryGroup {
  expiration: string;
  contracts: Contract[];
}

export interface Chain {
  snapshot: SnapshotMeta;
  expirations: ExpiryGroup[];
}

export interface SviParams {
  a: number;
  b: number;
  rho: number;
  m: number;
  sigma: number;
}

export interface SviSlice {
  expiration: string;
  t: number;
  params: SviParams;
  quoteCount: number;
  rmse: number;
  iterations: number;
  butterflyArbFree: boolean;
  kMin: number;
  kMax: number;
  calendarRepaired?: boolean;
}

export interface SurfaceGrid {
  moneyness: number[];
  expiries: string[];
  years: number[];
  strikes: number[][];
  /** null where the slice had no quotes to support that moneyness */
  iv: (number | null)[][];
}

export interface Surface {
  snapshot: SnapshotMeta;
  slices: SviSlice[];
  grid: SurfaceGrid;
  calendarArbFree: boolean;
  skippedExpirations: string[];
  computedAt: string;
}

export interface SavedStrategySummary {
  id: string;
  name: string;
  kind: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SavedStrategyLeg {
  action: "buy" | "sell";
  type: "call" | "put";
  strike: number;
  expiration: string;
  quantity: number;
  entryPrice: number | null;
}

export interface SavedStrategy extends SavedStrategySummary {
  ticker: string | null;
  legs: SavedStrategyLeg[];
}

export interface SessionUser {
  id: string;
  email: string;
  name: string;
}

export interface Session {
  user: SessionUser;
}
