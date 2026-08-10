import type { Context, MiddlewareHandler, Next } from "hono";
import { auth } from "@/lib/auth";
import { ApiError, errorResponse } from "@/lib/error";

export interface AppUser {
  id: string;
  email: string;
  name: string;
}

export type AppEnv = {
  Variables: {
    user: AppUser | null;
  };
};

/**
 * resolves the better auth session onto the context for every request. runs on
 * all routes so a handler can read the user without each one re-parsing the
 * cookie, and so an expired session reads as signed out rather than erroring.
 */
export const sessionMiddleware: MiddlewareHandler<AppEnv> = async (c, next) => {
  const result = await auth.api.getSession({ headers: c.req.raw.headers }).catch(() => null);
  const user = result?.user;

  c.set(
    "user",
    user === undefined || user === null
      ? null
      : { id: user.id, email: user.email, name: user.name },
  );

  await next();
};

/** rejects the request unless a session resolved */
export const requireAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (c.get("user") === null) return errorResponse(c, "UNAUTHORIZED");
  await next();
};

/** the signed-in user, for handlers that run behind requireAuth */
export const currentUser = (c: Context<AppEnv>): AppUser => {
  const user = c.get("user");
  if (user === null) throw new ApiError("UNAUTHORIZED", "Sign in to continue.");
  return user;
};

interface Bucket {
  count: number;
  resetAt: number;
}

export interface RateLimitOptions {
  /** requests allowed per window */
  limit: number;
  /** window length in milliseconds */
  windowMs: number;
}

/**
 * fixed-window limiter keyed by user when signed in, IP otherwise.
 *
 * in-process on purpose: this is one API process, and a redis round trip per
 * request would cost more than the limiter saves. it does mean limits reset on
 * restart and would need moving to redis behind more than one instance.
 */
export const rateLimit = (options: RateLimitOptions): MiddlewareHandler<AppEnv> => {
  const buckets = new Map<string, Bucket>();

  const sweep = (now: number): void => {
    // bounded cleanup so a flood of one-off keys cannot grow the map forever
    if (buckets.size < 5000) return;
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt <= now) buckets.delete(key);
    }
  };

  return async (c: Context<AppEnv>, next: Next) => {
    const now = Date.now();
    sweep(now);

    const user = c.get("user");
    const key =
      user?.id ??
      c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ??
      c.req.header("x-real-ip") ??
      "unknown";

    const bucket = buckets.get(key);
    if (bucket === undefined || bucket.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + options.windowMs });
      await next();
      return;
    }

    if (bucket.count >= options.limit) {
      const retryAfter = Math.ceil((bucket.resetAt - now) / 1000);
      c.header("retry-after", String(retryAfter));
      return errorResponse(
        c,
        "TOO_MANY_REQUESTS",
        `Too many requests. Try again in ${retryAfter}s.`,
      );
    }

    bucket.count++;
    await next();
  };
};
