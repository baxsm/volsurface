import { z } from "zod";

// validated once at boot. a missing or malformed value fails the process here
// rather than surfacing as a confusing runtime error deep in a service.
// not .strict() - this parses the whole process environment, which always
// carries unrelated system keys.
const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3007),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  // frontend origin allowed through CORS with credentials. never "*".
  WEB_ORIGIN: z.string().url().default("http://localhost:5173"),
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.string().url().default("http://localhost:3007"),
  // server-side only. the browser never sees this and never calls the vendor.
  ALPHA_VANTAGE_API_KEY: z.string().default(""),
  // "fixture" reads the committed chain, "alphavantage" calls the live API.
  MARKET_DATA_SOURCE: z.enum(["fixture", "alphavantage"]).default("fixture"),
  // guards the internal backfill trigger. unset means the route is disabled.
  OPS_TOKEN: z.string().default(""),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `  ${i.path.join(".") || "(root)"}: ${i.message}`);
  console.error(`invalid environment:\n${issues.join("\n")}`);
  process.exit(1);
}

export const env = parsed.data;

export const isProduction = env.NODE_ENV === "production";
