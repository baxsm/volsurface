import type { OptionType } from "@/engine";

/** one contract as the vendor reports it, already parsed into numbers */
export interface VendorContract {
  contractId: string;
  type: OptionType;
  strike: number;
  expiration: string;
  bid: number | null;
  ask: number | null;
  last: number | null;
  mark: number | null;
  volume: number | null;
  openInterest: number | null;
  vendorIv: number | null;
  vendorDelta: number | null;
  vendorGamma: number | null;
  vendorTheta: number | null;
  vendorVega: number | null;
  vendorRho: number | null;
}

export interface VendorChain {
  ticker: string;
  /** trade date the chain was captured on, YYYY-MM-DD */
  tradeDate: string;
  contracts: VendorContract[];
}

export interface VendorAdapter {
  /** stored on the snapshot so a row records which source produced it */
  readonly id: string;
  /**
   * fetch one chain. throws ApiError on a vendor failure rather than returning
   * a partial chain, so a bad pull never half-writes a snapshot.
   */
  fetchChain(ticker: string, tradeDate?: string): Promise<VendorChain>;
}
