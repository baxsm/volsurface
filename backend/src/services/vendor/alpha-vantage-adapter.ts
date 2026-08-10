import { env } from "@/env";
import { ApiError } from "@/lib/error";
import { logger } from "@/lib/logger";
import { toContract, vendorPayloadSchema } from "./parse";
import type { VendorAdapter, VendorChain } from "./types";

const BASE_URL = "https://www.alphavantage.co/query";
const TIMEOUT_MS = 20_000;

/**
 * live Alpha Vantage HISTORICAL_OPTIONS. not verified against the live
 * endpoint: that action and REALTIME_OPTIONS are premium-only, and a free key
 * is rejected for every symbol, IBM included. the response schema comes from
 * the committed fixture, a real captured response, so parsing is proven and
 * the http call is not. MARKET_DATA_SOURCE=fixture is the verified path.
 */
export class AlphaVantageAdapter implements VendorAdapter {
  readonly id = "alphavantage";

  async fetchChain(ticker: string, tradeDate?: string): Promise<VendorChain> {
    if (env.ALPHA_VANTAGE_API_KEY === "") {
      throw new ApiError("INTERNAL", "Market data key is not configured.");
    }

    const url = new URL(BASE_URL);
    url.searchParams.set("function", "HISTORICAL_OPTIONS");
    url.searchParams.set("symbol", ticker.toUpperCase());
    if (tradeDate !== undefined) url.searchParams.set("date", tradeDate);
    url.searchParams.set("apikey", env.ALPHA_VANTAGE_API_KEY);

    const response = await fetch(url, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { accept: "application/json" },
    }).catch((error: unknown) => {
      logger.error("vendor.alphavantage.fetch", error);
      throw new ApiError("INTERNAL", "Market data request failed.");
    });

    if (!response.ok) {
      // never echo the url back - it carries the api key
      logger.error("vendor.alphavantage.fetch", `status ${response.status}`);
      throw new ApiError("INTERNAL", `Market data request failed (${response.status}).`);
    }

    const body: unknown = await response.json();

    // the api answers 200 with an explanatory body for quota and premium
    // rejections, so a plain status check would read those as success
    const notice = rejectionNotice(body);
    if (notice !== null) {
      logger.error("vendor.alphavantage.rejected", notice);
      throw new ApiError("INTERNAL", "Market data request was rejected by the vendor.");
    }

    const parsed = vendorPayloadSchema.safeParse(body);
    if (!parsed.success) {
      logger.error("vendor.alphavantage.parse", parsed.error.issues.slice(0, 3));
      throw new ApiError("INTERNAL", "Market data response did not match the expected shape.");
    }

    const rows = parsed.data.data;
    const first = rows[0];
    if (first === undefined) {
      throw new ApiError("NOT_FOUND", `No chain returned for ${ticker.toUpperCase()}.`);
    }

    return {
      ticker: ticker.toUpperCase(),
      tradeDate: tradeDate ?? first.date,
      contracts: rows.map(toContract),
    };
  }
}

/** alpha vantage reports refusals in one of these keys with a 200 status */
const NOTICE_KEYS = ["Note", "Information", "Error Message"] as const;

export const rejectionNotice = (body: unknown): string | null => {
  if (typeof body !== "object" || body === null) return null;
  for (const key of NOTICE_KEYS) {
    const value = (body as Record<string, unknown>)[key];
    if (typeof value === "string" && value.length > 0) return value;
  }
  return null;
};
