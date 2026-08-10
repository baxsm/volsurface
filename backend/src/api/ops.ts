import { Hono } from "hono";
import { z } from "zod";
import { env } from "@/env";
import { ingestQueue } from "@/jobs/queue";
import { ApiError, errorResponse, handle } from "@/lib/error";
import type { AppEnv } from "./middleware";
import { tickerSchema } from "./validation";

/**
 * internal backfill trigger. not part of the public api and never called by the
 * client: a user-triggerable vendor pull would let one client burn the shared
 * daily quota. it enqueues a job rather than ingesting inline so a slow pull
 * cannot hold a request open.
 */
export const ops = new Hono<AppEnv>();

const bodySchema = z
  .object({
    ticker: tickerSchema,
    tradeDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "tradeDate must be YYYY-MM-DD")
      .optional(),
  })
  .strict();

// constant-time compare so a wrong token cannot be recovered byte by byte
const tokenMatches = (provided: string): boolean => {
  if (env.OPS_TOKEN.length === 0) return false;
  const a = new TextEncoder().encode(provided);
  const b = new TextEncoder().encode(env.OPS_TOKEN);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0;
};

ops.use("*", async (c, next) => {
  // an unset token disables the route outright rather than leaving it open
  if (env.OPS_TOKEN.length === 0) return errorResponse(c, "NOT_FOUND");
  const provided = c.req.header("x-ops-token") ?? "";
  if (!tokenMatches(provided)) return errorResponse(c, "NOT_FOUND");
  await next();
});

ops.post(
  "/ingest",
  handle("ops.ingest", async (c) => {
    const body: unknown = await c.req.json().catch(() => {
      throw new ApiError("BAD_REQUEST", "Body must be valid JSON.");
    });

    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiError("BAD_REQUEST", parsed.error.issues[0]?.message ?? "Invalid input.");
    }

    const job = await ingestQueue().add("manual-ingest", parsed.data, {
      attempts: 3,
      backoff: { type: "exponential", delay: 30_000 },
    });

    return c.json({ queued: true, jobId: job.id }, 202);
  }),
);
