import { createApp } from "@/app";
import { env } from "@/env";
import { logger } from "@/lib/logger";

const app = createApp();

logger.info("server.start", `listening on ${env.PORT}`);

export default {
  port: env.PORT,
  fetch: app.fetch,
};
