import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { env } from "@/env";
import { logger } from "@/lib/logger";

// migrations run on their own single connection and close it, so this can be
// run as a one-shot command without leaving a pool open.
const client = postgres(env.DATABASE_URL, { max: 1, onnotice: () => {} });

try {
  await migrate(drizzle(client), { migrationsFolder: "./drizzle" });
  logger.info("db.migrate", "migrations applied");
} catch (error) {
  logger.error("db.migrate", error);
  process.exitCode = 1;
} finally {
  await client.end();
}
