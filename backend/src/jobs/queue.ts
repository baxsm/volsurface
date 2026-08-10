import { Queue } from "bullmq";
import IORedis from "ioredis";
import { env } from "@/env";

export const INGEST_QUEUE = "chain-ingest";

export interface IngestJob {
  ticker: string;
  /** omitted means the vendor's latest available chain */
  tradeDate?: string | undefined;
}

// bullmq requires this to be null: with a retry limit the blocking commands the
// worker relies on error out instead of reconnecting.
export const redisConnection = () => new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null });

let queue: Queue<IngestJob> | null = null;

/** lazy so importing this never opens a redis socket at module load */
export const ingestQueue = (): Queue<IngestJob> => {
  if (queue === null) {
    queue = new Queue<IngestJob>(INGEST_QUEUE, { connection: redisConnection() });
  }
  return queue;
};

export const closeQueue = async (): Promise<void> => {
  if (queue !== null) {
    await queue.close();
    queue = null;
  }
};
