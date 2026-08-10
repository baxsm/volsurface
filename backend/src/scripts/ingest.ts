import { closeDb } from "@/db";
import { logger } from "@/lib/logger";
import { ingestChain } from "@/services/market/ingest";
import { seedSymbols } from "@/services/market/symbols";
import { vendorAdapter } from "@/services/vendor";

// manual ingest for local setup and backfill:
//   bun run src/scripts/ingest.ts IBM

const ticker = process.argv[2] ?? "IBM";

try {
  await seedSymbols();
  const result = await ingestChain(vendorAdapter(), ticker);
  logger.info(
    "market.ingest",
    `${result.ticker} ${result.tradeDate}: ${result.contractCount} contracts, ` +
      `${result.solvedCount} solved, ${result.fittedExpirations} expiries fitted, ` +
      `spot ${result.underlyingPrice?.toFixed(2)}, arb-free ${result.calendarArbFree}`,
  );
  if (result.skippedExpirations.length > 0) {
    logger.info("market.ingest", `skipped thin expiries: ${result.skippedExpirations.join(", ")}`);
  }
} catch (error) {
  logger.error("market.ingest", error);
  process.exitCode = 1;
} finally {
  await closeDb();
}
