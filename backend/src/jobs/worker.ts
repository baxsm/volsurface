import { Worker } from "bullmq";
import { closeDb } from "@/db";
import { logger } from "@/lib/logger";
import { ingestChain } from "@/services/market/ingest";
import { seedSymbols } from "@/services/market/symbols";
import { vendorAdapter } from "@/services/vendor";
import { closeQueue, INGEST_QUEUE, type IngestJob, ingestQueue, redisConnection } from "./queue";

// the vendor free tier allows 25 calls a day, so the schedule stays well inside
// it. users can never trigger a pull - that would let one client burn the
// shared quota - so ingestion only ever runs from this schedule or the guarded
// ops route.
const TRACKED_TICKERS = ["IBM"];
const DAILY_CRON = "30 22 * * 1-5";

const runIngest = async (job: IngestJob): Promise<void> => {
  const result = await ingestChain(vendorAdapter(), job.ticker, job.tradeDate);
  logger.info(
    "jobs.ingest",
    `${result.ticker} ${result.tradeDate}: ${result.contractCount} contracts, ` +
      `${result.fittedExpirations} expiries fitted, arb-free ${result.calendarArbFree}`,
  );
};

export const startWorker = () => {
  const worker = new Worker<IngestJob>(
    INGEST_QUEUE,
    async (job) => {
      await runIngest(job.data);
    },
    {
      connection: redisConnection(),
      // one chain at a time: ingestion is CPU-heavy (solving IV for every
      // contract, then fitting the surface) and would otherwise contend with
      // the api process
      concurrency: 1,
    },
  );

  worker.on("failed", (job, error) => {
    logger.error("jobs.ingest", `${job?.data.ticker ?? "unknown"}: ${error.message}`);
  });

  return worker;
};

/** registers the daily schedule, replacing any previous definition of it */
export const scheduleDaily = async (): Promise<void> => {
  const queue = ingestQueue();
  for (const ticker of TRACKED_TICKERS) {
    await queue.upsertJobScheduler(
      `daily-${ticker}`,
      { pattern: DAILY_CRON },
      {
        name: "daily-ingest",
        data: { ticker },
        opts: { attempts: 3, backoff: { type: "exponential", delay: 60_000 } },
      },
    );
  }
  logger.info("jobs.schedule", `daily ingest registered for ${TRACKED_TICKERS.join(", ")}`);
};

if (import.meta.main) {
  await seedSymbols();
  await scheduleDaily();
  const worker = startWorker();
  logger.info("jobs.worker", "worker started");

  const shutdown = async (): Promise<void> => {
    await worker.close();
    await closeQueue();
    await closeDb();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}
